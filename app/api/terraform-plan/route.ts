import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/auth";
import { importTerraformRisks } from "@/lib/repository";
import { parseTerraformPlan } from "@/lib/terraform-plan";

export async function POST(request: Request) {
  const member = await getCurrentMember();
  const body = (await request.json()) as { planJson?: string };

  if (!body.planJson) {
    return NextResponse.json({ error: "Terraform plan JSON is required" }, { status: 400 });
  }

  try {
    const parsedPlan = parseTerraformPlan(body.planJson);
    const state = await importTerraformRisks(member, parsedPlan.risks, parsedPlan.summary);

    return NextResponse.json({ ...state, terraformPlanSummary: parsedPlan.summary });
  } catch {
    return NextResponse.json({ error: "Invalid Terraform plan JSON" }, { status: 400 });
  }
}
