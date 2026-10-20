import { NextResponse } from "next/server";
import { getApiMember } from "@/lib/api-auth";
import { importTerraformRisks } from "@/lib/repository";
import { parseTerraformPlan } from "@/lib/terraform-plan";

export async function POST(request: Request) {
  const access = await getApiMember(request, "engineer");
  if (access.response) return access.response;
  const member = access.member;
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
