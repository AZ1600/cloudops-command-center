import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/auth";
import { canApprove, canExecute } from "@/lib/permissions";
import { getPlatformState, updateRisk } from "@/lib/repository";
import type { RiskStatus } from "@/lib/types";

type RouteContext = {
  params: Promise<{
    riskId: string;
  }>;
};

const allowedStatuses: RiskStatus[] = [
  "approved",
  "dismissed",
  "executed"
];

export async function PATCH(
  request: Request,
  context: RouteContext
) {
  const member = await getCurrentMember();
  const body = (await request.json()) as {
    status?: RiskStatus;
  };
  const status = body.status;

  if (!status || !allowedStatuses.includes(status)) {
    return NextResponse.json(
      { error: "Unsupported risk status" },
      { status: 400 }
    );
  }

  if (
    (status === "approved" || status === "dismissed") &&
    !canApprove(member.role)
  ) {
    return NextResponse.json(
      { error: "Role cannot approve or dismiss risks" },
      { status: 403 }
    );
  }

  if (status === "executed" && !canExecute(member.role)) {
    return NextResponse.json(
      { error: "Role cannot execute remediations" },
      { status: 403 }
    );
  }

  const { riskId } = await context.params;
  const currentState = await getPlatformState(member);
  const risk = currentState.risks.find(
    (item) => item.id === riskId
  );

  if (!risk) {
    return NextResponse.json(
      { error: "Risk not found" },
      { status: 404 }
    );
  }

  if (
    status === "executed" &&
    risk.status !== "approved"
  ) {
    return NextResponse.json(
      {
        error:
          "Risk must be approved before execution"
      },
      { status: 409 }
    );
  }

  const state = await updateRisk(
    member,
    riskId,
    status
  );

  return NextResponse.json(state);
}
