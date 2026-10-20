import { withWorkspaceAccessErrors } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import { getApiMember } from "@/lib/api-auth";
import { resetRiskScan } from "@/lib/repository";

export const POST = withWorkspaceAccessErrors(async function POST() {
  const access = await getApiMember(undefined, "owner");
  if (access.response) return access.response;
  const member = access.member;
  const state = await resetRiskScan(member);

  return NextResponse.json(state);
});
