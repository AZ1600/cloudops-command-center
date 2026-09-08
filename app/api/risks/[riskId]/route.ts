import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/auth";
import { canApprove, canExecute } from "@/lib/permissions";
import {
  getPlatformState,
  updateRisk
} from "@/lib/repository";
import {
  attachRequestId,
  emitOperationalEvent,
  getRequestId
} from "@/lib/telemetry";
import type { RiskStatus } from "@/lib/types";

type RouteContext = {
  params: Promise<{
    riskId: string;
  }>;
};

const route = "/api/risks/[riskId]";

const allowedStatuses: RiskStatus[] = [
  "approved",
  "dismissed",
  "executed"
];

export async function PATCH(
  request: Request,
  context: RouteContext
) {
  const requestId = getRequestId(request);
  const member = await getCurrentMember();

  const body = (await request.json()) as {
    status?: RiskStatus;
  };

  const status = body.status;

  if (!status || !allowedStatuses.includes(status)) {
    emitOperationalEvent("warn", {
      event: "risk.status.rejected",
      requestId,
      route,
      outcome: "rejected",
      statusCode: 400,
      requestedStatus: status,
      actorRole: member.role,
      reason: "unsupported_status"
    });

    return attachRequestId(
      NextResponse.json(
        { error: "Unsupported risk status" },
        { status: 400 }
      ),
      requestId
    );
  }

  if (
    (status === "approved" ||
      status === "dismissed") &&
    !canApprove(member.role)
  ) {
    emitOperationalEvent("warn", {
      event: "risk.status.rejected",
      requestId,
      route,
      outcome: "rejected",
      statusCode: 403,
      requestedStatus: status,
      actorRole: member.role,
      reason: "approval_permission_denied"
    });

    return attachRequestId(
      NextResponse.json(
        {
          error:
            "Role cannot approve or dismiss risks"
        },
        { status: 403 }
      ),
      requestId
    );
  }

  if (
    status === "executed" &&
    !canExecute(member.role)
  ) {
    emitOperationalEvent("warn", {
      event: "risk.execution.rejected",
      requestId,
      route,
      outcome: "rejected",
      statusCode: 403,
      requestedStatus: status,
      actorRole: member.role,
      reason: "execution_permission_denied"
    });

    return attachRequestId(
      NextResponse.json(
        {
          error:
            "Role cannot execute remediations"
        },
        { status: 403 }
      ),
      requestId
    );
  }

  const { riskId } = await context.params;

  const currentState =
    await getPlatformState(member);

  const risk = currentState.risks.find(
    (item) => item.id === riskId
  );

  if (!risk) {
    emitOperationalEvent("warn", {
      event: "risk.status.rejected",
      requestId,
      route,
      outcome: "rejected",
      statusCode: 404,
      riskId,
      requestedStatus: status,
      actorRole: member.role,
      reason: "risk_not_found"
    });

    return attachRequestId(
      NextResponse.json(
        { error: "Risk not found" },
        { status: 404 }
      ),
      requestId
    );
  }

  if (
    status === "executed" &&
    risk.status !== "approved"
  ) {
    emitOperationalEvent("warn", {
      event: "risk.execution.blocked",
      requestId,
      route,
      outcome: "blocked",
      statusCode: 409,
      riskId,
      requestedStatus: status,
      currentStatus: risk.status,
      actorRole: member.role,
      reason: "approval_required"
    });

    return attachRequestId(
      NextResponse.json(
        {
          error:
            "Risk must be approved before execution"
        },
        { status: 409 }
      ),
      requestId
    );
  }

  const state = await updateRisk(
    member,
    riskId,
    status
  );

  emitOperationalEvent("info", {
    event: "risk.status.completed",
    requestId,
    route,
    outcome: "completed",
    statusCode: 200,
    riskId,
    requestedStatus: status,
    currentStatus: status,
    actorRole: member.role
  });

  return attachRequestId(
    NextResponse.json(state),
    requestId
  );
}
