import { describe, expect, it } from "vitest";
import { mockSignals } from "@/data/mock-signals";
import { runbooks } from "@/data/runbooks";

describe("runbook catalog", () => {
  it("covers every mock infrastructure service", () => {
    const coveredServices = new Set(runbooks.flatMap((runbook) => runbook.appliesTo));

    expect(mockSignals.every((signal) => coveredServices.has(signal.service))).toBe(true);
  });

  it("documents safety checks and rollback plans", () => {
    expect(runbooks.length).toBeGreaterThanOrEqual(5);
    expect(runbooks.every((runbook) => runbook.safetyChecks.length >= 3)).toBe(true);
    expect(runbooks.every((runbook) => runbook.rollbackPlan.length >= 3)).toBe(true);
  });
});
