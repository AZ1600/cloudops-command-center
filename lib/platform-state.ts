import { mockSignals } from "@/data/mock-signals";
import { analyzeSignals } from "@/lib/risk-engine";
import type { AuditEvent, ExecutionEvent, PlatformState, Workspace, WorkspaceMember } from "@/lib/types";

export const demoWorkspace: Workspace = {
  id: "workspace-demo",
  name: "CloudOps Demo Workspace",
  plan: "demo",
};

export const demoMember: WorkspaceMember = {
  id: "member-demo-owner",
  workspaceId: demoWorkspace.id,
  email: "owner@cloudops.example",
  name: "Demo Platform Owner",
  role: "owner",
};

export function createInitialAuditEvents(riskCount: number): AuditEvent[] {
  return [
    {
      id: "audit-scan-001",
      riskId: "scan",
      riskTitle: "Initial infrastructure scan",
      action: "scan",
      actor: "CloudOps AI",
      detail: `${riskCount} infrastructure risks detected and routed to owners.`,
      createdAt: "Just now",
    },
  ];
}

export function createDemoPlatformState(member: WorkspaceMember = demoMember): PlatformState {
  const risks = analyzeSignals(mockSignals);
  const executionEvents: ExecutionEvent[] = [];

  return {
    workspace: demoWorkspace,
    currentMember: member,
    risks,
    auditEvents: createInitialAuditEvents(risks.length),
    executionEvents,
  };
}
