import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/auth";
import { WorkspaceAccessError } from "@/lib/auth-errors";
import { hasMinimumRole } from "@/lib/permissions";
import { attachRequestId, getRequestId } from "@/lib/telemetry";
import type { UserRole, WorkspaceMember } from "@/lib/types";

type AccessResult =
  | { member: WorkspaceMember; response?: never }
  | { member?: never; response: NextResponse };

export function accessErrorResponse(error: unknown, request?: Request) {
  const failure = error instanceof WorkspaceAccessError
    ? error
    : new WorkspaceAccessError(503, "Authentication is temporarily unavailable.");
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  // Browser authentication uses a Clerk session, not the integration bearer token.
  const response = NextResponse.json(
    { error: failure.message },
    { status: failure.status, headers },
  );
  return request ? attachRequestId(response, getRequestId(request)) : response;
}

export async function getApiMember(
  request?: Request,
  minimumRole: UserRole = "viewer",
): Promise<AccessResult> {
  try {
    const member = await getCurrentMember();
    if (!hasMinimumRole(member.role, minimumRole)) {
      throw new WorkspaceAccessError(403, "Your role cannot perform this operation.");
    }
    return { member };
  } catch (error) {
    return { response: accessErrorResponse(error, request) };
  }
}
