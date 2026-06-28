import type { InfrastructureRisk, RiskCategory, RiskSeverity, TerraformPlanSummary } from "@/lib/types";

type TerraformResourceChange = {
  address?: string;
  type?: string;
  name?: string;
  change?: {
    actions?: string[];
    before?: unknown;
    after?: unknown;
  };
};

type TerraformPlan = {
  resource_changes?: TerraformResourceChange[];
};

type ParsedPlan = {
  risks: InfrastructureRisk[];
  summary: TerraformPlanSummary;
};

export function parseTerraformPlan(planJson: string): ParsedPlan {
  const plan = JSON.parse(planJson) as TerraformPlan;
  const changes = Array.isArray(plan.resource_changes) ? plan.resource_changes : [];
  const risks = changes.flatMap((change, index) => classifyChange(change, index));

  return {
    risks,
    summary: {
      totalChanges: changes.length,
      riskyChanges: risks.length,
      generatedRisks: risks.length,
    },
  };
}

function classifyChange(change: TerraformResourceChange, index: number): InfrastructureRisk[] {
  const type = change.type ?? "";
  const address = change.address ?? `${type}.${change.name ?? index}`;
  const after = asRecord(change.change?.after);
  const before = asRecord(change.change?.before);
  const actions = change.change?.actions ?? [];
  const risks: InfrastructureRisk[] = [];

  if (type === "aws_security_group_rule" && exposesWorld(after)) {
    risks.push(
      buildRisk({
        id: `tf-${stableId(address)}-public-ingress`,
        service: inferService(address),
        title: "Terraform plan opens security group to the internet",
        detail: `${address} allows ingress from 0.0.0.0/0 or ::/0.`,
        category: "security",
        severity: isSshOrRdp(after) ? "critical" : "high",
        evidence: [`Resource: ${address}`, `Actions: ${actions.join(", ") || "planned change"}`, "Ingress CIDR includes public internet"],
        commandPreview: `terraform plan -target=${address}`,
        recommendation: "Restrict ingress to approved CIDR ranges or route access through VPN/bastion controls.",
      }),
    );
  }

  if (type === "aws_s3_bucket_public_access_block" && disablesS3PublicAccess(after)) {
    risks.push(
      buildRisk({
        id: `tf-${stableId(address)}-s3-public-access`,
        service: inferService(address),
        title: "Terraform plan weakens S3 public access protection",
        detail: `${address} disables one or more S3 Block Public Access controls.`,
        category: "security",
        severity: "critical",
        evidence: [`Resource: ${address}`, "S3 public access block is being disabled", `Actions: ${actions.join(", ") || "planned change"}`],
        commandPreview: `terraform plan -target=${address}`,
        recommendation: "Keep S3 Block Public Access enabled and use signed URLs or CloudFront for controlled access.",
      }),
    );
  }

  if (type === "aws_iam_policy" && containsWildcardPolicy(after)) {
    risks.push(
      buildRisk({
        id: `tf-${stableId(address)}-iam-wildcard`,
        service: inferService(address),
        title: "Terraform plan adds broad IAM permissions",
        detail: `${address} appears to include wildcard IAM permissions.`,
        category: "security",
        severity: "high",
        evidence: [`Resource: ${address}`, "Policy contains wildcard action or resource", `Actions: ${actions.join(", ") || "planned change"}`],
        commandPreview: `terraform plan -target=${address}`,
        recommendation: "Replace wildcard permissions with least-privilege actions and resource ARNs.",
      }),
    );
  }

  if (actions.includes("delete") && isCriticalResource(type)) {
    risks.push(
      buildRisk({
        id: `tf-${stableId(address)}-critical-delete`,
        service: inferService(address),
        title: "Terraform plan deletes a critical infrastructure resource",
        detail: `${address} is marked for deletion and may affect production availability.`,
        category: "reliability",
        severity: "high",
        evidence: [`Resource: ${address}`, `Resource type: ${type}`, "Plan action includes delete"],
        commandPreview: `terraform plan -target=${address}`,
        recommendation: "Confirm replacement, backup, and rollback paths before approving the destructive change.",
      }),
    );
  }

  if (type === "aws_instance" && instanceSizeChanged(before, after)) {
    risks.push(
      buildRisk({
        id: `tf-${stableId(address)}-instance-cost`,
        service: inferService(address),
        title: "Terraform plan changes EC2 instance size",
        detail: `${address} changes instance type from ${String(before.instance_type)} to ${String(after.instance_type)}.`,
        category: "cost",
        severity: "medium",
        evidence: [`Resource: ${address}`, `Before: ${String(before.instance_type)}`, `After: ${String(after.instance_type)}`],
        commandPreview: `terraform plan -target=${address}`,
        recommendation: "Validate the sizing change against expected traffic, cost budget, and performance evidence.",
      }),
    );
  }

  return risks;
}

function buildRisk(input: {
  id: string;
  service: string;
  title: string;
  detail: string;
  category: RiskCategory;
  severity: RiskSeverity;
  evidence: string[];
  commandPreview: string;
  recommendation: string;
}): InfrastructureRisk {
  return {
    id: input.id,
    source: "terraform",
    service: input.service,
    owner: ownerForCategory(input.category),
    title: input.title,
    detail: input.detail,
    category: input.category,
    severity: input.severity,
    evidence: input.evidence,
    detectedAt: new Date().toISOString(),
    impact: impactFor(input.category, input.service),
    recommendation: {
      summary: input.recommendation,
      steps: [
        "Review the Terraform plan evidence and confirm the intended change.",
        "Open a pull request with the safer infrastructure change.",
        "Run plan again and require owner approval before apply.",
      ],
      executionMode: "pull_request",
      commandPreview: input.commandPreview,
    },
    status: "needs_approval",
    approvalRequired: true,
    routedTo: ownerForCategory(input.category),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function exposesWorld(after: Record<string, unknown>) {
  const cidrBlocks = toStringArray(after.cidr_blocks);
  const ipv6CidrBlocks = toStringArray(after.ipv6_cidr_blocks);

  return cidrBlocks.includes("0.0.0.0/0") || ipv6CidrBlocks.includes("::/0");
}

function isSshOrRdp(after: Record<string, unknown>) {
  const fromPort = Number(after.from_port);
  const toPort = Number(after.to_port);

  return (fromPort <= 22 && toPort >= 22) || (fromPort <= 3389 && toPort >= 3389);
}

function disablesS3PublicAccess(after: Record<string, unknown>) {
  const keys = ["block_public_acls", "block_public_policy", "ignore_public_acls", "restrict_public_buckets"];

  return keys.some((key) => after[key] === false);
}

function containsWildcardPolicy(after: Record<string, unknown>) {
  const policy = typeof after.policy === "string" ? after.policy : JSON.stringify(after.policy ?? {});

  return policy.includes('"Action":"*"') || policy.includes('"Action": "*"') || policy.includes('"Resource":"*"') || policy.includes('"Resource": "*"');
}

function isCriticalResource(type: string) {
  return ["aws_db_instance", "aws_rds_cluster", "aws_eks_cluster", "aws_lb", "aws_s3_bucket"].includes(type);
}

function instanceSizeChanged(before: Record<string, unknown>, after: Record<string, unknown>) {
  return Boolean(before.instance_type && after.instance_type && before.instance_type !== after.instance_type);
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function stableId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function inferService(address: string) {
  if (address.includes("network") || address.includes("security_group")) {
    return "networking";
  }

  if (address.includes("s3") || address.includes("asset") || address.includes("bucket")) {
    return "customer-assets";
  }

  if (address.includes("iam")) {
    return "identity-platform";
  }

  return "terraform-workspace";
}

function ownerForCategory(category: RiskCategory) {
  if (category === "security") {
    return "Security Owner";
  }

  if (category === "cost") {
    return "FinOps Owner";
  }

  return "Cloud Platform";
}

function impactFor(category: RiskCategory, service: string) {
  if (category === "security") {
    return `${service} has a planned infrastructure change that could increase exposure, compliance, or incident response risk.`;
  }

  if (category === "cost") {
    return `${service} has a planned sizing or spend change that should be validated before approval.`;
  }

  return `${service} has a planned infrastructure change that may affect reliability or availability.`;
}
