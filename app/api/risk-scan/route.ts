import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/auth";
import { resetRiskScan } from "@/lib/repository";

export async function POST() {
  const member = await getCurrentMember();
  const state = await resetRiskScan(member);

  return NextResponse.json(state);
}
