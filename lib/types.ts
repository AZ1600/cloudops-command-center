export type SignalSource = "github" | "aws" | "kubernetes" | "terraform" | "monitoring";

export type UserRole = "owner" | "admin" | "engineer" | "viewer";

export type Workspace = {
  id: string;
  name: string;
  plan: "demo" | "starter" | "team" | "enterprise";
};

export type WorkspaceMember = {
  id: string;
  workspaceId: string;
  email: string;
  name: string;
  role: UserRole;
};

export type RiskCategory = "reliability" | "security" | "cost" | "deployment";

export type RiskSeverity = "critical" | "high" | "medium" | "low";

export type RiskStatus = "open" | "needs_approval" | "approved" | "executed" | "dismissed";

export type InfrastructureSignal = {
  id: string;
  source: SignalSource;
  service: string;
  owner: string;
  title: string;
  detail: string;
  category: RiskCategory;
  severity: RiskSeverity;
  evidence: string[];
  detectedAt: string;
};

export type Remediation = {
  summary: string;
  steps: string[];
  executionMode: "manual" | "pull_request" | "workflow" | "simulated";
  commandPreview?: string;
};

export type InfrastructureRisk = InfrastructureSignal & {
  impact: string;
  recommendation: Remediation;
  status: RiskStatus;
  approvalRequired: true;
  routedTo: string;
};

export type RiskSummary = {
  total: number;
  critical: number;
  high: number;
  needsApproval: number;
  approved: number;
  executed: number;
  dismissed: number;
  estimatedMonthlySavings: number;
};

export type AuditEvent = {
  id: string;
  riskId: string;
  riskTitle: string;
  action: "approved" | "dismissed" | "executed" | "scan";
  actor: string;
  detail: string;
  createdAt: string;
};

export type ExecutionEvent = {
  id: string;
  riskId: string;
  title: string;
  owner: string;
  mode: Remediation["executionMode"];
  commandPreview?: string;
  steps: string[];
  createdAt: string;
};

export type Runbook = {
  id: string;
  title: string;
  category: RiskCategory;
  owner: string;
  appliesTo: string[];
  executionMode: Remediation["executionMode"];
  safetyChecks: string[];
  rollbackPlan: string[];
};

export type IntegrationStatus = "connected" | "mock" | "not_connected";

export type Integration = {
  id: SignalSource;
  name: string;
  status: IntegrationStatus;
  lastSync: string;
  provides: string[];
  nextStep: string;
};

export type ServiceHealth = "healthy" | "degraded" | "critical" | "watch";

export type ServiceCatalogItem = {
  id: string;
  name: string;
  owner: string;
  runtime: string;
  environment: "production" | "staging" | "shared";
  health: ServiceHealth;
  lastChange: string;
  integrations: SignalSource[];
};

export type PlatformState = {
  workspace: Workspace;
  currentMember: WorkspaceMember;
  risks: InfrastructureRisk[];
  auditEvents: AuditEvent[];
  executionEvents: ExecutionEvent[];
};
