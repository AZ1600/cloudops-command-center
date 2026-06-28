import { describe, expect, it } from "vitest";
import { parseGitHubActionsRuns } from "@/lib/github-actions";

describe("parseGitHubActionsRuns", () => {
  it("converts failed workflow runs into deployment risks", () => {
    const result = parseGitHubActionsRuns(
      {
        workflow_runs: [
          {
            id: 123,
            name: "Production Deploy",
            conclusion: "failure",
            head_branch: "main",
            html_url: "https://github.com/AZ1600/cloudops-command-center/actions/runs/123",
            run_number: 9,
            updated_at: "2026-06-28T18:00:00Z",
          },
        ],
      },
      "AZ1600/cloudops-command-center",
    );

    expect(result.summary.totalRuns).toBe(1);
    expect(result.summary.failedRuns).toBe(1);
    expect(result.risks[0].source).toBe("github");
    expect(result.risks[0].severity).toBe("high");
    expect(result.risks[0].routedTo).toBe("Platform Team");
  });

  it("ignores successful workflow runs", () => {
    const result = parseGitHubActionsRuns(
      {
        workflow_runs: [
          {
            id: 124,
            name: "CI",
            conclusion: "success",
            head_branch: "main",
          },
        ],
      },
      "AZ1600/cloudops-command-center",
    );

    expect(result.summary.generatedRisks).toBe(0);
    expect(result.risks).toHaveLength(0);
  });

  it("marks non-production failures as medium severity", () => {
    const result = parseGitHubActionsRuns(
      {
        workflow_runs: [
          {
            id: 125,
            name: "CI",
            conclusion: "timed_out",
            head_branch: "feature/test",
          },
        ],
      },
      "AZ1600/cloudops-command-center",
    );

    expect(result.risks[0].severity).toBe("medium");
  });
});
