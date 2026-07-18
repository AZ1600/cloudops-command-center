import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

const validatorPath = path.join(
  projectRoot,
  "scripts",
  "validate-operational-finding.mjs"
);

function runValidator(findingPath?: string) {
  const argumentsForNode = [validatorPath];

  if (findingPath) {
    argumentsForNode.push(findingPath);
  }

  return spawnSync(process.execPath, argumentsForNode, {
    cwd: projectRoot,
    encoding: "utf8"
  });
}

describe("operational finding contract", () => {
  it("accepts a valid PlatformPilot finding", () => {
    const result = runValidator();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "Operational finding is valid: contracts/examples/platform-pilot-valid.json"
    );
    expect(result.stderr).toBe("");
  });

  it("rejects an invalid PlatformPilot finding", () => {
    const result = runValidator(
      "contracts/examples/platform-pilot-invalid.json"
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Operational finding is invalid:"
    );
    expect(result.stderr).toContain("unexpectedField");
    expect(result.stderr).toContain("/confidence: must be <= 1");
  });
});