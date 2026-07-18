import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/auth";
import {
  mapPlatformPilotFindingToRisk,
  validatePlatformPilotFinding
} from "@/lib/platform-pilot";
import { importPlatformPilotRisk } from "@/lib/repository";

export async function POST(request: Request) {
  const member = await getCurrentMember();

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Request body must contain valid JSON"
      },
      {
        status: 400
      }
    );
  }

  const validation = validatePlatformPilotFinding(body);

  if (!validation.valid) {
    return NextResponse.json(
      {
        error: "PlatformPilot finding failed contract validation",
        validationErrors: validation.errors
      },
      {
        status: 422
      }
    );
  }

  const risk = mapPlatformPilotFindingToRisk(
    validation.finding
  );

  const state = await importPlatformPilotRisk(member, risk);

  return NextResponse.json({
    ...state,
    platformPilotImport: {
      findingId: validation.finding.findingId,
      riskId: risk.id,
      status: "accepted"
    }
  });
}