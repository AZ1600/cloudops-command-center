import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/auth";
import { getPlatformState } from "@/lib/repository";

export async function GET() {
  const member = await getCurrentMember();
  const state = await getPlatformState(member);

  return NextResponse.json(state);
}
