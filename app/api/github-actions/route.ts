import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/auth";
import { fetchGitHubActionsRisks } from "@/lib/github-actions";
import { importGitHubActionsRisks } from "@/lib/repository";

export async function POST(request: Request) {
  const member = await getCurrentMember();
  const body = (await request.json()) as { repository?: string };

  if (!body.repository) {
    return NextResponse.json({ error: "GitHub repository is required" }, { status: 400 });
  }

  try {
    const result = await fetchGitHubActionsRisks(body.repository);
    const state = await importGitHubActionsRisks(member, result.risks, result.summary);

    return NextResponse.json({ ...state, githubActionsSummary: result.summary });
  } catch {
    return NextResponse.json({ error: "Unable to fetch GitHub Actions runs. Use owner/repo format and check repository access." }, { status: 400 });
  }
}
