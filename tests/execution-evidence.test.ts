import {
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  getPlatformState,
  resetRiskScan,
  updateRisk,
} from "@/lib/repository";
import type {
  WorkspaceMember,
} from "@/lib/types";

const member: WorkspaceMember = {
  id: "execution-evidence-owner",
  workspaceId: "workspace-demo",
  email: "owner@cloudops.example",
  name: "Execution Evidence Owner",
  role: "owner",
};

describe("execution evidence", () => {
  beforeEach(async () => {
    await resetRiskScan(member);
  });

  it(
    "links execution evidence to the approval actor and request",
    async () => {
      const initialState =
        await getPlatformState(member);

      const risk =
        initialState.risks[0];

      expect(risk).toBeDefined();
      expect(risk.status).toBe(
        "needs_approval",
      );

      const approvalRequestId =
        "request-approval-001";

      const approvedState =
        await updateRisk(
          member,
          risk.id,
          "approved",
          approvalRequestId,
        );

      const approvalEvent =
        approvedState.auditEvents.find(
          (event) =>
            event.riskId === risk.id &&
            event.action === "approved",
        );

      expect(approvalEvent).toBeDefined();
      expect(
        approvalEvent?.actor,
      ).toBe(member.name);
      expect(
        approvalEvent?.requestId,
      ).toBe(approvalRequestId);

      const executionRequestId =
        "request-execution-001";

      const executedState =
        await updateRisk(
          member,
          risk.id,
          "executed",
          executionRequestId,
        );

      const executionEvent =
        executedState.executionEvents.find(
          (event) =>
            event.riskId === risk.id,
        );

      expect(executionEvent).toBeDefined();

      expect(
        executionEvent?.requestId,
      ).toBe(executionRequestId);

      expect(
        executionEvent?.requestedBy,
      ).toBe(member.name);

      expect(
        executionEvent?.approvedBy,
      ).toBe(member.name);

      expect(
        executionEvent?.approvalRequestId,
      ).toBe(approvalRequestId);

      expect(
        executionEvent?.approvedAt,
      ).not.toBe("Unknown");

      expect(
        executionEvent?.beforeStatus,
      ).toBe("approved");

      expect(
        executionEvent?.afterStatus,
      ).toBe("executed");

      expect(
        executionEvent?.outcome,
      ).toBe("succeeded");

      expect(
        executionEvent?.steps,
      ).toEqual(
        expect.arrayContaining([
          "Approval evidence verified",
          "Execution permission verified",
          "Safety checks passed",
          "Command preview recorded",
          "Simulated remediation completed",
          "Execution evidence persisted",
        ]),
      );
    },
  );
});