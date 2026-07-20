import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import operationalFindingSchema from "@/contracts/operational-finding.schema.json";
import type {
  InfrastructureRisk,
  RiskCategory
} from "@/lib/types";

export type PlatformPilotCategory =
  | "workload-health"
  | "deployment"
  | "security"
  | "capacity"
  | "observability";

export type PlatformPilotFinding = {
  schemaVersion: "1.0";
  findingId: string;
  source: "platform-pilot";
  observedAt: string;
  environment: "local" | "development" | "staging" | "production";
  cluster?: string;
  namespace?: string;
  resource?: {
    kind: string;
    name: string;
    container?: string;
  };
  service: string;
  category: PlatformPilotCategory;
  severity: "critical" | "high" | "medium" | "low";
  confidence: number;
  summary: string;
  evidence: string[];
  recommendedRunbook?: string;
  approvalRequired: true;
  correlationId?: string;
};

export type PlatformPilotValidationResult =
  | {
      valid: true;
      finding: PlatformPilotFinding;
    }
  | {
      valid: false;
      errors: string[];
    };

const categoryMap: Record<PlatformPilotCategory, RiskCategory> = {
  "workload-health": "reliability",
  deployment: "deployment",
  security: "security",
  capacity: "reliability",
  observability: "reliability"
};

const ajv = new Ajv2020({
  allErrors: true,
  strict: true
});

addFormats(ajv);

const validateFinding = ajv.compile<PlatformPilotFinding>(
  operationalFindingSchema
);

export function validatePlatformPilotFinding(
  input: unknown
): PlatformPilotValidationResult {
  const valid = validateFinding(input);

  if (!valid) {
    const errors = (validateFinding.errors ?? []).map((error) => {
      const location = error.instancePath || "/";

      if (error.keyword === "additionalProperties") {
        return `${location}: ${error.message}: ${error.params.additionalProperty}`;
      }

      return `${location}: ${error.message}`;
    });

    return {
      valid: false,
      errors
    };
  }

  return {
    valid: true,
    finding: input
  };
}

export function mapPlatformPilotFindingToRisk(
  finding: PlatformPilotFinding
): InfrastructureRisk {
  const resourceLabel = buildResourceLabel(finding);
  const confidencePercentage = Math.round(finding.confidence * 100);

  const contextualEvidence = [
    `Environment: ${finding.environment}`,
    finding.cluster ? `Cluster: ${finding.cluster}` : null,
    finding.namespace ? `Namespace: ${finding.namespace}` : null,
    resourceLabel ? `Resource: ${resourceLabel}` : null,
    `PlatformPilot confidence: ${confidencePercentage}%`,
    finding.correlationId
      ? `Correlation ID: ${finding.correlationId}`
      : null
  ].filter((item): item is string => item !== null);

  const runbookStep = finding.recommendedRunbook
    ? `Open the ${finding.recommendedRunbook} runbook and review its safety checks.`
    : "Select the appropriate diagnostic runbook for this finding.";

  return {
    id: `platform-pilot-${finding.findingId}`,
    source: "kubernetes",
    service: finding.service,
    owner: "Platform Team",
    title: finding.summary,
    detail:
      `${finding.summary} PlatformPilot observed this in ` +
      `${finding.environment} with ${confidencePercentage}% confidence.`,
    category: categoryMap[finding.category],
    severity: finding.severity,
    evidence: [
      ...finding.evidence,
      ...contextualEvidence
    ],
    detectedAt: finding.observedAt,
    impact:
      `${finding.service} may be affected if this condition continues. ` +
      "An engineer should confirm the evidence and assess user impact.",
    recommendation: {
      summary:
        "Investigate the evidence, confirm the root cause, and prepare a reviewed remediation.",
      steps: [
        "Review every evidence item supplied by PlatformPilot.",
        runbookStep,
        "Confirm the affected resource and reproduce the condition where safe.",
        "Prepare a remediation and rollback plan.",
        "Request approval before making any infrastructure change."
      ],
      executionMode: "manual"
    },
    status: "needs_approval",
    approvalRequired: true,
    routedTo: "Platform Team"
  };
}

function buildResourceLabel(
  finding: PlatformPilotFinding
): string | null {
  if (!finding.resource) {
    return null;
  }

  const container = finding.resource.container
    ? `, container ${finding.resource.container}`
    : "";

  return `${finding.resource.kind}/${finding.resource.name}${container}`;
}