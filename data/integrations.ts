import type { Integration } from "@/lib/types";

export const integrations: Integration[] = [
  {
    id: "github",
    name: "GitHub Actions",
    status: "connected",
    lastSync: "Live fetch available",
    provides: ["workflow runs", "deployment failures", "release history"],
    nextStep: "Fetch workflow runs by repository and route failed deployments to owners.",
  },
  {
    id: "aws",
    name: "AWS",
    status: "mock",
    lastSync: "4 minutes ago",
    provides: ["S3 posture", "cost findings", "resource inventory"],
    nextStep: "Add read-only IAM role for CloudWatch, Cost Explorer, and IAM Access Analyzer.",
  },
  {
    id: "kubernetes",
    name: "Kubernetes",
    status: "mock",
    lastSync: "5 minutes ago",
    provides: ["pod health", "restart counts", "readiness failures"],
    nextStep: "Connect cluster service account with read-only workload access.",
  },
  {
    id: "terraform",
    name: "Terraform",
    status: "mock",
    lastSync: "8 minutes ago",
    provides: ["drift signals", "plan output", "module ownership"],
    nextStep: "Import Terraform plan JSON from CI before apply.",
  },
  {
    id: "monitoring",
    name: "Prometheus / Monitoring",
    status: "not_connected",
    lastSync: "Not synced",
    provides: ["alerts", "SLO burn rate", "latency anomalies"],
    nextStep: "Connect alert webhook after the core remediation flow is stable.",
  },
];
