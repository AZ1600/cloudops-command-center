import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/auth";
import { authenticatePlatformPilotRequest } from "@/lib/platform-pilot-auth";
import {
  mapPlatformPilotFindingToRisk,
  validatePlatformPilotFinding
} from "@/lib/platform-pilot";
import { importPlatformPilotRisk } from "@/lib/repository";
import {
  attachRequestId,
  emitOperationalEvent,
  getRequestId
} from "@/lib/telemetry";

const route = "/api/platform-pilot/findings";

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  const authentication =
    authenticatePlatformPilotRequest(request);

  if (!authentication.authorized) {
    emitOperationalEvent("warn", {
      event: "platform-pilot.ingestion.rejected",
      requestId,
      route,
      outcome: "rejected",
      statusCode: authentication.status,
      reason:
        authentication.status === 503
          ? "ingestion_not_configured"
          : "authorization_failed"
    });

    return attachRequestId(
      NextResponse.json(
        {
          error: authentication.error
        },
        {
          status: authentication.status
        }
      ),
      requestId
    );
  }

  const member = await getCurrentMember();

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    emitOperationalEvent("warn", {
      event: "platform-pilot.ingestion.rejected",
      requestId,
      route,
      outcome: "rejected",
      statusCode: 400,
      actorRole: member.role,
      reason: "malformed_json"
    });

    return attachRequestId(
      NextResponse.json(
        {
          error: "Request body must contain valid JSON"
        },
        {
          status: 400
        }
      ),
      requestId
    );
  }

  const validation =
    validatePlatformPilotFinding(body);

  if (!validation.valid) {
    emitOperationalEvent("warn", {
      event: "platform-pilot.ingestion.rejected",
      requestId,
      route,
      outcome: "rejected",
      statusCode: 422,
      actorRole: member.role,
      reason: "contract_validation_failed"
    });

    return attachRequestId(
      NextResponse.json(
        {
          error:
            "PlatformPilot finding failed contract validation",
          validationErrors: validation.errors
        },
        {
          status: 422
        }
      ),
      requestId
    );
  }

  const risk = mapPlatformPilotFindingToRisk(
    validation.finding
  );

  const state = await importPlatformPilotRisk(
    member,
    risk
  );

  emitOperationalEvent("info", {
    event: "platform-pilot.ingestion.accepted",
    requestId,
    route,
    outcome: "accepted",
    statusCode: 200,
    riskId: risk.id,
    findingId: validation.finding.findingId,
    actorRole: member.role
  });

  return attachRequestId(
    NextResponse.json({
      ...state,
      platformPilotImport: {
        findingId: validation.finding.findingId,
        riskId: risk.id,
        status: "accepted"
      }
    }),
    requestId
  );
}
