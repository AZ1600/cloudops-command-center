import { describe, expect, it } from "vitest";
import { parseTerraformPlan } from "@/lib/terraform-plan";

describe("parseTerraformPlan", () => {
  it("detects public SSH ingress", () => {
    const result = parseTerraformPlan(
      JSON.stringify({
        resource_changes: [
          {
            address: "aws_security_group_rule.admin_ssh",
            type: "aws_security_group_rule",
            change: {
              actions: ["create"],
              after: {
                cidr_blocks: ["0.0.0.0/0"],
                from_port: 22,
                to_port: 22,
              },
            },
          },
        ],
      }),
    );

    expect(result.summary.generatedRisks).toBe(1);
    expect(result.risks[0].severity).toBe("critical");
    expect(result.risks[0].routedTo).toBe("Security Owner");
  });

  it("detects S3 public access block weakening", () => {
    const result = parseTerraformPlan(
      JSON.stringify({
        resource_changes: [
          {
            address: "aws_s3_bucket_public_access_block.customer_assets",
            type: "aws_s3_bucket_public_access_block",
            change: {
              actions: ["update"],
              after: {
                block_public_policy: false,
              },
            },
          },
        ],
      }),
    );

    expect(result.risks[0].title).toContain("S3 public access");
    expect(result.risks[0].severity).toBe("critical");
  });

  it("detects IAM wildcard policies", () => {
    const result = parseTerraformPlan(
      JSON.stringify({
        resource_changes: [
          {
            address: "aws_iam_policy.platform_admin",
            type: "aws_iam_policy",
            change: {
              actions: ["create"],
              after: {
                policy: '{"Statement":[{"Action":"*","Resource":"*"}]}',
              },
            },
          },
        ],
      }),
    );

    expect(result.risks[0].title).toContain("IAM");
    expect(result.risks[0].severity).toBe("high");
  });

  it("detects critical destructive changes", () => {
    const result = parseTerraformPlan(
      JSON.stringify({
        resource_changes: [
          {
            address: "aws_db_instance.primary",
            type: "aws_db_instance",
            change: {
              actions: ["delete"],
            },
          },
        ],
      }),
    );

    expect(result.risks[0].category).toBe("reliability");
    expect(result.risks[0].title).toContain("deletes");
  });

  it("does not create risks for safe plans", () => {
    const result = parseTerraformPlan(
      JSON.stringify({
        resource_changes: [
          {
            address: "aws_security_group_rule.private_https",
            type: "aws_security_group_rule",
            change: {
              actions: ["create"],
              after: {
                cidr_blocks: ["10.0.0.0/16"],
                from_port: 443,
                to_port: 443,
              },
            },
          },
        ],
      }),
    );

    expect(result.summary.totalChanges).toBe(1);
    expect(result.summary.generatedRisks).toBe(0);
  });
});
