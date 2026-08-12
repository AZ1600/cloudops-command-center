import type {
  DecisionTrace,
  DecisionTraceStep,
  RiskSeverity
} from "@/lib/types";

export type DecisionTraceInput = {
  id: string;
  sourceLabel?: string;
  service: string;
  environment: string;
  severity: RiskSeverity;
  summary: string;
  evidence: string[];
  confidence: number;
  verificationGuidance?: string;
};

const confidenceAdjustment = {
  premise: 0,
  reasoning: -0.05,
  hypothesis: -0.1,
  verification: -0.05,
  conclusion: -0.1
} as const;

export function createDecisionTrace(input: DecisionTraceInput): DecisionTrace {
  const prefix = `decision-${input.id}`;
  const premiseId = `${prefix}-premise`;
  const reasoningId = `${prefix}-reasoning`;
  const hypothesisId = `${prefix}-hypothesis`;
  const verificationId = `${prefix}-verification`;
  const conclusionId = `${prefix}-conclusion`;
  const evidenceSummary = input.evidence.map((item) => `“${item}”`).join("; ");

  const steps: DecisionTraceStep[] = [
    {
      id: premiseId,
      type: "premise",
      content:
        `${input.sourceLabel ?? "PlatformPilot"} reported ${input.summary.toLowerCase()} in ${input.environment}. ` +
        `Supplied evidence: ${evidenceSummary}`,
      confidence: adjustedConfidence(input.confidence, confidenceAdjustment.premise),
      dependencies: []
    },
    {
      id: reasoningId,
      type: "reasoning",
      content:
        `The supplied observations indicate a ${input.severity} condition affecting ` +
        `${input.service}; the evidence must still be confirmed by an engineer.`,
      confidence: adjustedConfidence(input.confidence, confidenceAdjustment.reasoning),
      dependencies: [premiseId]
    },
    {
      id: hypothesisId,
      type: "hypothesis",
      content:
        `If the observations are current and accurate, ${input.service} may require ` +
        "a reviewed remediation to prevent or reduce service impact.",
      confidence: adjustedConfidence(input.confidence, confidenceAdjustment.hypothesis),
      dependencies: [reasoningId]
    },
    {
      id: verificationId,
      type: "verification",
      content:
        input.verificationGuidance ??
        "Verify the raw evidence, affected resource, current service health, blast radius, and rollback plan.",
      confidence: adjustedConfidence(input.confidence, confidenceAdjustment.verification),
      dependencies: [premiseId, hypothesisId]
    },
    {
      id: conclusionId,
      type: "conclusion",
      content:
        "Keep the risk in needs_approval and require human review before any manual infrastructure change.",
      confidence: adjustedConfidence(input.confidence, confidenceAdjustment.conclusion),
      dependencies: [verificationId]
    }
  ];

  return { steps, conclusionId };
}

function adjustedConfidence(confidence: number, adjustment: number): number {
  const finiteConfidence = Number.isFinite(confidence) ? confidence : 0;
  return Math.round(Math.min(1, Math.max(0, finiteConfidence + adjustment)) * 100) / 100;
}
