import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it
} from "vitest";
import validFinding from "@/contracts/examples/platform-pilot-valid.json";
import invalidFinding from "@/contracts/examples/platform-pilot-invalid.json";
import { POST } from "@/app/api/platform-pilot/findings/route";
import { resetRiskScan } from "@/lib/repository";
import type {
  InfrastructureRisk,
  WorkspaceMember
} from "@/lib/types";

const endpoint =
  "http://localhost/api/platform-pilot/findings";

const testToken = "route-test-token";

const originalToken =
  process.env.PLATFORM_PILOT_INGEST_TOKEN;

const testMember: WorkspaceMember = {
  id: "member-demo-owner",
  workspaceId: "workspace-demo",
  email: "owner@cloudops.example",
  name: "Demo Platform Owner",
  role: "owner"
};

function createJsonRequest(
  body: unknown,
  token: string | null = testToken
) {
  const headers = new Headers({
    "Content-Type": "application/json"
  });

  if (token) {
    headers.set(
      "Authorization",
      `Bearer ${token}`
    );
  }

  return new Request(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

describe("POST /api/platform-pilot/findings", () => {
  beforeEach(async () => {
    process.env.PLATFORM_PILOT_INGEST_TOKEN =
      testToken;

    await resetRiskScan(testMember);
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.PLATFORM_PILOT_INGEST_TOKEN;
      return;
    }

    process.env.PLATFORM_PILOT_INGEST_TOKEN =
      originalToken;
  });

  it("returns 503 when ingestion is not configured", async () => {
    delete process.env.PLATFORM_PILOT_INGEST_TOKEN;

    const response = await POST(
      createJsonRequest(validFinding)
    );

    const body = (await response.json()) as {
      error: string;
    };

    expect(response.status).toBe(503);
    expect(body.error).toBe(
      "PlatformPilot ingestion is not configured"
    );
  });

  it("returns 401 when authorization is missing", async () => {
    const response = await POST(
      createJsonRequest(validFinding, null)
    );

    const body = (await response.json()) as {
      error: string;
    };

    expect(response.status).toBe(401);
    expect(body.error).toBe(
      "PlatformPilot authorization failed"
    );
  });

  it("returns 400 when the request body is malformed JSON", async () => {
    const request = new Request(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testToken}`
      },
      body: "{"
    });

    const response = await POST(request);
    const body = (await response.json()) as {
      error: string;
    };

    expect(response.status).toBe(400);
    expect(body.error).toBe(
      "Request body must contain valid JSON"
    );
  });

  it("returns 422 when the finding violates the contract", async () => {
    const response = await POST(
      createJsonRequest(invalidFinding)
    );

    const body = (await response.json()) as {
      error: string;
      validationErrors: string[];
    };

    expect(response.status).toBe(422);
    expect(body.error).toBe(
      "PlatformPilot finding failed contract validation"
    );
    expect(body.validationErrors).toContain(
      "/confidence: must be <= 1"
    );
  });

  it("imports a valid finding as an approval-gated risk", async () => {
    const response = await POST(
      createJsonRequest(validFinding)
    );

    const body = (await response.json()) as {
      risks: InfrastructureRisk[];
      platformPilotImport: {
        findingId: string;
        riskId: string;
        status: string;
      };
    };

    expect(response.status).toBe(200);
    expect(body.platformPilotImport).toEqual({
      findingId: "platform-pilot-local-001",
      riskId:
        "platform-pilot-platform-pilot-local-001",
      status: "accepted"
    });

    const importedRisk = body.risks.find(
      (risk) =>
        risk.id ===
        "platform-pilot-platform-pilot-local-001"
    );

    expect(importedRisk).toBeDefined();
    expect(importedRisk?.status).toBe("needs_approval");
    expect(importedRisk?.approvalRequired).toBe(true);
  });

  it("does not create duplicate risks for the same finding ID", async () => {
    await POST(createJsonRequest(validFinding));

    const secondResponse = await POST(
      createJsonRequest(validFinding)
    );

    const secondBody = (await secondResponse.json()) as {
      risks: InfrastructureRisk[];
    };

    const matchingRisks = secondBody.risks.filter(
      (risk) =>
        risk.id ===
        "platform-pilot-platform-pilot-local-001"
    );

    expect(secondResponse.status).toBe(200);
    expect(matchingRisks).toHaveLength(1);
  });
});