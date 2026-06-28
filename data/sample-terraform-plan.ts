export const sampleTerraformPlan = JSON.stringify(
  {
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
      {
        address: "aws_s3_bucket_public_access_block.customer_assets",
        type: "aws_s3_bucket_public_access_block",
        change: {
          actions: ["update"],
          after: {
            block_public_policy: false,
            restrict_public_buckets: false,
          },
        },
      },
      {
        address: "aws_db_instance.primary",
        type: "aws_db_instance",
        change: {
          actions: ["delete"],
        },
      },
    ],
  },
  null,
  2,
);
