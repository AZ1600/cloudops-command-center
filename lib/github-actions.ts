import type { GitHubActionsSummary, InfrastructureRisk, RiskSeverity } from "@/lib/types";

type GitHubWorkflowRun = {
  id: number;
  name?: string;
  display_title?: string;
  status?: string;
  conclusion?: string | null;
  html_url?: string;
  head_branch?: string;
  event?: string;
  run_attempt?: number;
  run_number?: number;
  created_at?: string;
  updated_at?: string;
};

type GitHubWorkflowRunsResponse = {
  workflow_runs?: GitHubWorkflowRun[];
  total_count?: number;
};

type GitHubActionsResult = {
  risks: InfrastructureRisk[];
  summary: GitHubActionsSummary;
};

const failureConclusions = new Set(["failure", "timed_out", "cancelled", "startup_failure", "action_required"]);

export async function fetchGitHubActionsRisks(repository: string): Promise<GitHubActionsResult> {
  const normalizedRepository = normalizeRepository(repository);
  const response = await fetch(`https://api.github.com/repos/${normalizedRepository}/actions/runs?per_page=20`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: process.env.GITHUB_TOKEN ? `Bearer ${process.env.GITHUB_TOKEN}` : "",
      "User-Agent": "cloudops-command-center",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`GitHub Actions request failed with ${response.status}`);
  }

  const data = (await response.json()) as GitHubWorkflowRunsResponse;
  return parseGitHubActionsRuns(data, normalizedRepository);
}

export function parseGitHubActionsRuns(data: GitHubWorkflowRunsResponse, repository: string): GitHubActionsResult {
  const runs = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
  const failedRuns = runs.filter((run) => run.conclusion && failureConclusions.has(run.conclusion));
  const risks = failedRuns.map((run) => buildRiskFromRun(run, repository));

  return {
    risks,
    summary: {
      repository,
      totalRuns: runs.length,
      failedRuns: failedRuns.length,
      generatedRisks: risks.length,
    },
  };
}

function buildRiskFromRun(run: GitHubWorkflowRun, repository: string): InfrastructureRisk {
  const workflowName = run.name ?? "GitHub Actions workflow";
  const branch = run.head_branch ?? "unknown branch";
  const conclusion = run.conclusion ?? "failed";
  const severity = severityFor(run);
  const service = serviceFor(workflowName, repository);
  const runUrl = run.html_url ?? `https://github.com/${repository}/actions`;

  return {
    id: `gh-${stableId(repository)}-${run.id}`,
    source: "github",
    service,
    owner: "Platform Team",
    title: `${workflowName} workflow ${conclusion.replace("_", " ")}`,
    detail: `${workflowName} on ${branch} ended with ${conclusion.replace("_", " ")} and needs platform review before another release attempt.`,
    category: "deployment",
    severity,
    evidence: [
      `Repository: ${repository}`,
      `Workflow run #${run.run_number ?? run.id}`,
      `Branch: ${branch}`,
      `Conclusion: ${conclusion}`,
      `Run URL: ${runUrl}`,
    ],
    detectedAt: run.updated_at ?? run.created_at ?? new Date().toISOString(),
    impact: `${service} may not be safely receiving the latest release until the failed workflow is investigated and rerun.`,
    recommendation: {
      summary: "Inspect the failed workflow logs, fix the failing step, and rerun the pipeline after approval.",
      steps: [
        "Open the GitHub Actions run and inspect the failed job logs.",
        "Identify whether the failure is code, infrastructure, dependency, or secret related.",
        "Patch the issue in a pull request or rerun only after owner approval.",
      ],
      executionMode: "workflow",
      commandPreview: `gh run view ${run.id} --repo ${repository} --log-failed`,
    },
    status: "needs_approval",
    approvalRequired: true,
    routedTo: "Platform Team",
  };
}

function normalizeRepository(repository: string) {
  const trimmed = repository.trim().replace(/^https:\/\/github.com\//, "").replace(/\.git$/, "");

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed)) {
    throw new Error("Repository must use owner/repo format");
  }

  return trimmed;
}

function severityFor(run: GitHubWorkflowRun): RiskSeverity {
  const name = `${run.name ?? ""} ${run.display_title ?? ""}`.toLowerCase();
  const branch = (run.head_branch ?? "").toLowerCase();

  if (branch === "main" || branch === "master" || name.includes("production") || name.includes("deploy")) {
    return "high";
  }

  return "medium";
}

function serviceFor(workflowName: string, repository: string) {
  const name = workflowName.toLowerCase();

  if (name.includes("deploy") || name.includes("release")) {
    return "deployment-platform";
  }

  if (name.includes("security") || name.includes("scan")) {
    return "security-controls";
  }

  return repository.split("/")[1] ?? "github-workflow";
}

function stableId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
