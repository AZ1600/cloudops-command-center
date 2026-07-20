import { describe, expect, it } from "vitest";
import validFinding from "@/contracts/examples/platform-pilot-valid.json";
import invalidFinding from "@/contracts/examples/platform-pilot-invalid.json";
import {
  mapPlatformPilotFindingToRisk,
  validatePlatformPilotFinding
} from "@/lib/platform-pilot";

describe("PlatformPilot finding validation", () => {
  it("accepts a finding that follows the shared contract", () => {
    const result = validatePlatformPilotFinding(validFinding);

    expect(result.valid).toBe(true);

    if (!result.valid) {
      throw new Error(result.errors.join("\n"));
    }

    expect(result.finding.source).toBe("platform-pilot");
    expect(result.finding.service).toBe("worker-ingestion");
    expect(result.finding.approvalRequired).toBe(true);
  });

  it("rejects a finding that breaks the shared contract", () => {
    const result = validatePlatformPilotFinding(invalidFinding);

    expect(result.valid).toBe(false);

    if (result.valid) {
      throw new Error("Expected the invalid finding to be rejected");
    }

    expect(result.errors).toContain(
      "/: must NOT have additional properties: unexpectedField"
    );
    expect(result.errors).toContain(
      "/confidence: must be <= 1"
    );
    expect(result.errors).toContain(
      "/approvalRequired: must be equal to constant"
    );
  });
});

describe("PlatformPilot risk mapping", () => {
  it("maps a valid finding into an approval-gated CloudOps risk", () => {
    const validation = validatePlatformPilotFinding(validFinding);

    if (!validation.valid) {
      throw new Error(validation.errors.join("\n"));
    }

    const risk = mapPlatformPilotFindingToRisk(validation.finding);

    expect(risk.id).toBe(
      "platform-pilot-platform-pilot-local-001"
    );
    expect(risk.source).toBe("kubernetes");
    expect(risk.service).toBe("worker-ingestion");
    expect(risk.category).toBe("reliability");
    expect(risk.severity).toBe("critical");
    expect(risk.status).toBe("needs_approval");
    expect(risk.approvalRequired).toBe(true);
    expect(risk.routedTo).toBe("Platform Team");
    expect(risk.recommendation.executionMode).toBe("manual");

    expect(risk.evidence).toEqual(
      expect.arrayContaining([
        "Container worker is in CrashLoopBackOff.",
        "Environment: local",
        "Cluster: docker-desktop",
        "Namespace: default",
        "PlatformPilot confidence: 94%",
        "Correlation ID: incident-local-001"
      ])
    );
  });
});