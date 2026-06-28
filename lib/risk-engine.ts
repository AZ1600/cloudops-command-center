import type { InfrastructureRisk, InfrastructureSignal, Remediation, RiskSeverity, RiskSummary } from "@/lib/types";

const severityRank: Record<RiskSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function buildImpact(signal: InfrastructureSignal): string {
  if (signal.category === "security") {
    return `${signal.service} has a security exposure that could increase compliance, data access, or incident response risk.`;
  }

  if (signal.category === "cost") {
    return `${signal.service} is likely wasting cloud spend that can be reduced without changing customer-facing functionality.`;
  }

  if (signal.category === "deployment") {
    return `${signal.service} cannot safely receive the latest release until the failed deployment is investigated and rerun.`;
  }

  return `${signal.service} has reliability symptoms that may affect user experience or delay background processing.`;
}

function buildRemediation(signal: InfrastructureSignal): Remediation {
  if (signal.id === "sig-aws-001") {
    return {
      summary: "Re-enable S3 Block Public Access and replace public reads with signed URLs.",
      steps: [
        "Confirm the bucket does not intentionally host public website assets.",
        "Enable account and bucket-level Block Public Access.",
        "Update application access to use pre-signed URLs or CloudFront signed URLs.",
        "Open a pull request with the bucket policy and Terraform guardrail change.",
      ],
      executionMode: "pull_request",
      commandPreview: "terraform plan -target=aws_s3_bucket_public_access_block.customer_assets",
    };
  }

  if (signal.id === "sig-k8s-001") {
    return {
      summary: "Pause noisy restarts, inspect logs, and roll back or patch the failing worker image.",
      steps: [
        "Check previous container logs for the first failing stack trace.",
        "Compare the current image tag with the last healthy deployment.",
        "Scale a canary worker after applying the fix.",
        "Resume the deployment only after readiness checks pass.",
      ],
      executionMode: "workflow",
      commandPreview: "kubectl logs deploy/worker-ingestion --previous",
    };
  }

  if (signal.id === "sig-cost-001") {
    return {
      summary: "Snapshot unattached volumes, apply retention policy, then delete confirmed unused resources.",
      steps: [
        "Tag each unattached volume with owner and review deadline.",
        "Create a final snapshot for rollback safety.",
        "Delete volumes with no owner response after approval.",
        "Add a weekly unused-volume report to prevent repeat waste.",
      ],
      executionMode: "simulated",
      commandPreview: "aws ec2 describe-volumes --filters Name=status,Values=available",
    };
  }

  if (signal.id === "sig-tf-001") {
    return {
      summary: "Restore the managed security group rule through Terraform and add drift detection to CI.",
      steps: [
        "Verify whether emergency access was approved.",
        "Revert the SSH ingress CIDR back to the approved range.",
        "Run Terraform plan against the networking workspace.",
        "Require approval before applying the rule correction.",
      ],
      executionMode: "pull_request",
      commandPreview: "terraform plan -target=module.networking.aws_security_group.admin",
    };
  }

  return {
    summary: "Inspect the failing deployment, fix the migration timeout, and rerun the release pipeline.",
    steps: [
      "Open the failed GitHub Actions run and inspect the migration logs.",
      "Check database lock and connection timeout metrics.",
      "Patch the migration or increase the safe timeout.",
      "Rerun the deployment after platform owner approval.",
    ],
    executionMode: "workflow",
    commandPreview: "gh run view 184 --log-failed",
  };
}

export function analyzeSignals(signals: InfrastructureSignal[]): InfrastructureRisk[] {
  return [...signals]
    .sort((a, b) => severityRank[b.severity] - severityRank[a.severity])
    .map((signal) => ({
      ...signal,
      impact: buildImpact(signal),
      recommendation: buildRemediation(signal),
      status: "needs_approval",
      approvalRequired: true,
      routedTo: signal.owner,
    }));
}

export function summarizeRisks(risks: InfrastructureRisk[]): RiskSummary {
  const activeRisks = risks.filter((risk) => risk.status !== "dismissed");

  return {
    total: activeRisks.length,
    critical: activeRisks.filter((risk) => risk.severity === "critical").length,
    high: activeRisks.filter((risk) => risk.severity === "high").length,
    needsApproval: risks.filter((risk) => risk.status === "needs_approval").length,
    approved: risks.filter((risk) => risk.status === "approved" || risk.status === "executed").length,
    executed: risks.filter((risk) => risk.status === "executed").length,
    dismissed: risks.filter((risk) => risk.status === "dismissed").length,
    estimatedMonthlySavings: 148,
  };
}
