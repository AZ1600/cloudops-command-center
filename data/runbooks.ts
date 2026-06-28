import type { Runbook } from "@/lib/types";

export const runbooks: Runbook[] = [
  {
    id: "rb-s3-public-access",
    title: "Public S3 Access Remediation",
    category: "security",
    owner: "Security Owner",
    appliesTo: ["customer-assets"],
    executionMode: "pull_request",
    safetyChecks: [
      "Confirm the bucket is not intentionally hosting public website assets.",
      "Verify customer uploads can be served through signed URLs.",
      "Run Terraform plan before changing the bucket policy.",
    ],
    rollbackPlan: [
      "Revert the bucket policy pull request.",
      "Restore the last known-good access policy from version control.",
      "Re-run object access tests for customer downloads.",
    ],
  },
  {
    id: "rb-k8s-crash-loop",
    title: "Kubernetes CrashLoopBackOff Response",
    category: "reliability",
    owner: "Data Platform",
    appliesTo: ["worker-ingestion"],
    executionMode: "workflow",
    safetyChecks: [
      "Read previous container logs before restarting pods.",
      "Check image tag against the last healthy release.",
      "Confirm queue backlog can tolerate a canary restart.",
    ],
    rollbackPlan: [
      "Roll deployment back to the previous image tag.",
      "Scale workers to the last stable replica count.",
      "Requeue failed jobs after readiness checks pass.",
    ],
  },
  {
    id: "rb-deployment-failure",
    title: "Failed Production Deployment Recovery",
    category: "deployment",
    owner: "Platform Team",
    appliesTo: ["payments-api"],
    executionMode: "workflow",
    safetyChecks: [
      "Review failed migration logs and database lock metrics.",
      "Confirm production is still serving the previous healthy release.",
      "Require owner approval before rerunning deployment.",
    ],
    rollbackPlan: [
      "Keep traffic on the previous deployment.",
      "Disable the failing migration step until patched.",
      "Open an incident note with the failed run and owner.",
    ],
  },
  {
    id: "rb-terraform-drift",
    title: "Terraform Drift Correction",
    category: "security",
    owner: "Cloud Platform",
    appliesTo: ["networking"],
    executionMode: "pull_request",
    safetyChecks: [
      "Confirm whether the out-of-band change had emergency approval.",
      "Generate a Terraform plan scoped to the drifted resource.",
      "Validate the restored CIDR does not block approved access.",
    ],
    rollbackPlan: [
      "Revert the remediation pull request.",
      "Reapply the previous approved security group rule.",
      "Attach the rollback decision to the audit log.",
    ],
  },
  {
    id: "rb-unused-cloud-cost",
    title: "Unused Cloud Resource Cleanup",
    category: "cost",
    owner: "FinOps Owner",
    appliesTo: ["analytics-cluster"],
    executionMode: "simulated",
    safetyChecks: [
      "Confirm unattached volumes have no read or write activity.",
      "Create a final snapshot before deletion.",
      "Notify the service owner before cleanup approval.",
    ],
    rollbackPlan: [
      "Restore the deleted volume from snapshot.",
      "Reattach the restored volume to the approved instance.",
      "Update the cost exception list if the volume is intentionally retained.",
    ],
  },
];
