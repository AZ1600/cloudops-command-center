import { withWorkspaceAccessErrors } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import { getApiMember } from "@/lib/api-auth";
import { getPlatformState } from "@/lib/repository";

export const dynamic = "force-dynamic";

export const GET = withWorkspaceAccessErrors(async function GET() {
  const access = await getApiMember(undefined);
  if (access.response) return access.response;
  const member = access.member;
  const state = await getPlatformState(member);

  return NextResponse.json(state, { headers: { "Cache-Control": "private, no-store" } });
});
