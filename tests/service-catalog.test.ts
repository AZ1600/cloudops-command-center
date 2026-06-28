import { describe, expect, it } from "vitest";
import { integrations } from "@/data/integrations";
import { mockSignals } from "@/data/mock-signals";
import { serviceCatalog } from "@/data/service-catalog";

describe("service catalog", () => {
  it("contains every service referenced by risk signals", () => {
    const catalogIds = new Set(serviceCatalog.map((service) => service.id));

    expect(mockSignals.every((signal) => catalogIds.has(signal.service))).toBe(true);
  });

  it("uses known integration sources", () => {
    const integrationIds = new Set(integrations.map((integration) => integration.id));

    expect(serviceCatalog.every((service) => service.integrations.every((integration) => integrationIds.has(integration)))).toBe(true);
  });
});
