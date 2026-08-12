import { describe, expect, it } from "vitest";
import { createDecisionTrace } from "@/lib/decision-trace";

const baseInput = {
  id: "finding-001",
  service: "worker-ingestion",
  environment: "production",
  severity: "critical" as const,
  summary: "Worker pod is repeatedly restarting.",
  evidence: ["Pod is in CrashLoopBackOff.", "Restart count is 7."],
  confidence: 0.94
};

describe("decision trace engine", () => {
  it("creates a deterministic, ordered trace with explicit dependencies", () => {
    const firstTrace = createDecisionTrace(baseInput);
    const secondTrace = createDecisionTrace(baseInput);

    expect(firstTrace).toEqual(secondTrace);
    expect(firstTrace.steps.map((step) => step.type)).toEqual([
      "premise",
      "reasoning",
      "hypothesis",
      "verification",
      "conclusion"
    ]);
    expect(firstTrace.steps[0].dependencies).toEqual([]);
    expect(firstTrace.steps[1].dependencies).toEqual([firstTrace.steps[0].id]);
    expect(firstTrace.steps[3].dependencies).toEqual([
      firstTrace.steps[0].id,
      firstTrace.steps[2].id
    ]);
    expect(firstTrace.conclusionId).toBe(firstTrace.steps[4].id);
  });

  it("uses supplied evidence and keeps every confidence value bounded", () => {
    const trace = createDecisionTrace({ ...baseInput, confidence: 4.2 });

    expect(trace.steps[0].content).toContain("Pod is in CrashLoopBackOff.");
    expect(trace.steps[0].content).toContain("Restart count is 7.");
    expect(trace.steps.every((step) => step.confidence >= 0 && step.confidence <= 1)).toBe(true);
  });

  it("makes the approval and manual-review boundary explicit", () => {
    const trace = createDecisionTrace(baseInput);
    const conclusion = trace.steps.find((step) => step.type === "conclusion");

    expect(conclusion?.content).toContain("needs_approval");
    expect(conclusion?.content).toContain("human review");
    expect(conclusion?.content).toContain("manual infrastructure change");
  });
});
