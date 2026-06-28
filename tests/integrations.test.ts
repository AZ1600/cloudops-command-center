import { describe, expect, it } from "vitest";
import { integrations } from "@/data/integrations";
import { mockSignals } from "@/data/mock-signals";

describe("integration catalog", () => {
  it("covers every infrastructure signal source", () => {
    const integrationIds = new Set(integrations.map((integration) => integration.id));

    expect(mockSignals.every((signal) => integrationIds.has(signal.source))).toBe(true);
  });

  it("documents what each connector provides", () => {
    expect(integrations.length).toBeGreaterThanOrEqual(5);
    expect(integrations.every((integration) => integration.provides.length >= 3)).toBe(true);
  });
});
