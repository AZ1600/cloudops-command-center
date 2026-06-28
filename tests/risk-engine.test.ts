import { describe, expect, it } from "vitest";
import { mockSignals } from "@/data/mock-signals";
import { analyzeSignals, summarizeRisks } from "@/lib/risk-engine";

describe("risk engine", () => {
  it("turns infrastructure signals into approval-gated risks", () => {
    const risks = analyzeSignals(mockSignals);

    expect(risks).toHaveLength(mockSignals.length);
    expect(risks[0].severity).toBe("critical");
    expect(risks.every((risk) => risk.approvalRequired)).toBe(true);
    expect(risks.every((risk) => risk.status === "needs_approval")).toBe(true);
  });

  it("summarizes critical, high, and cost impact", () => {
    const summary = summarizeRisks(analyzeSignals(mockSignals));

    expect(summary.total).toBe(5);
    expect(summary.critical).toBe(1);
    expect(summary.high).toBe(3);
    expect(summary.needsApproval).toBe(5);
    expect(summary.estimatedMonthlySavings).toBe(148);
  });

  it("keeps every risk explainable with source evidence", () => {
    const risks = analyzeSignals(mockSignals);

    expect(risks.every((risk) => risk.evidence.length >= 3)).toBe(true);
  });
});
