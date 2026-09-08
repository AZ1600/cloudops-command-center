import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it
} from "vitest";

import validFinding from "@/contracts/examples/platform-pilot-valid.json";
import { POST } from "@/app/api/platform-pilot/findings/route";
import { PATCH } from "@/app/api/risks/[riskId]/route";
import {
  getPlatformState,
  resetRiskScan
} from "@/lib/repository";
import type { WorkspaceMember } from "@/lib/types";

const ingestEndpoint =
  "http://localhost/api/platform-pilot/findings";

const testToken = "approval-gate-test-token";

const originalToken =
  process.env.PLATFORM_PILOT_INGEST_TOKEN;

const testMember: WorkspaceMember = {
  id: "member-demo-owner",
  workspaceId: "workspace-demo",
  email: "owner@cloudops.example",
  name: "Demo Platform Owner",
  role: "owner"
};

function createIngestRequest() {
  return new Request(ingestEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testToken}`
    },
    body: JSON.stringify(validFinding)
  });
}

function createStatusRequest(
  riskId: string,
  status: "approved" | "executed",
  requestId?: string
) {
  const headers = new Headers({
    "Content-Type": "application/json"
  });

  if (requestId) {
    headers.set("x-request-id", requestId);
  }

  return new Request(
    `http://localhost/api/risks/${riskId}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status })
    }
  );
}

function createContext(riskId: string) {
  return {
    params: Promise.resolve({ riskId })
  };
}

describe("approval-gated remediation workflow", () => {
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

  it(
    "blocks execution until approval and records the approved execution",
    async () => {
      const ingestResponse = await POST(
        createIngestRequest()
      );

      expect(ingestResponse.status).toBe(200);

      const ingestBody =
        (await ingestResponse.json()) as {
          platformPilotImport: {
            riskId: string;
          };
        };

      const riskId =
        ingestBody.platformPilotImport.riskId;

      const blockedRequestId =
        "approval-gate-request-001";

      const blockedExecution = await PATCH(
        createStatusRequest(
          riskId,
          "executed",
          blockedRequestId
        ),
        createContext(riskId)
      );

      expect(blockedExecution.status).toBe(409);

      expect(
        blockedExecution.headers.get(
          "x-request-id"
        )
      ).toBe(blockedRequestId);

      const blockedBody =
        (await blockedExecution.json()) as {
          error: string;
        };

      expect(blockedBody.error).toBe(
        "Risk must be approved before execution"
      );

      let state =
        await getPlatformState(testMember);

      expect(
        state.risks.find(
          (risk) => risk.id === riskId
        )?.status
      ).toBe("needs_approval");

      expect(
        state.executionEvents.some(
          (event) => event.riskId === riskId
        )
      ).toBe(false);

      const approvalResponse = await PATCH(
        createStatusRequest(
          riskId,
          "approved"
        ),
        createContext(riskId)
      );

      expect(approvalResponse.status).toBe(200);

      state = await getPlatformState(testMember);

      expect(
        state.risks.find(
          (risk) => risk.id === riskId
        )?.status
      ).toBe("approved");

      expect(
        state.auditEvents.some(
          (event) =>
            event.riskId === riskId &&
            event.action === "approved"
        )
      ).toBe(true);

      const executionResponse = await PATCH(
        createStatusRequest(
          riskId,
          "executed"
        ),
        createContext(riskId)
      );

      expect(executionResponse.status).toBe(200);

      state = await getPlatformState(testMember);

      expect(
        state.risks.find(
          (risk) => risk.id === riskId
        )?.status
      ).toBe("executed");

      expect(
        state.executionEvents.some(
          (event) => event.riskId === riskId
        )
      ).toBe(true);

      expect(
        state.auditEvents.some(
          (event) =>
            event.riskId === riskId &&
            event.action === "executed"
        )
      ).toBe(true);
    }
  );
});
