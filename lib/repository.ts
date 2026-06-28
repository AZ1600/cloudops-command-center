import { getPool, isPostgresEnabled } from "@/lib/db";
import { createDemoPlatformState, demoWorkspace } from "@/lib/platform-state";
import type { AuditEvent, ExecutionEvent, InfrastructureRisk, PlatformState, RiskStatus, WorkspaceMember } from "@/lib/types";

let memoryState = createDemoPlatformState();

function nowLabel() {
  return "Just now";
}

export async function getPlatformState(member: WorkspaceMember): Promise<PlatformState> {
  if (!isPostgresEnabled()) {
    memoryState = { ...memoryState, currentMember: member };
    return memoryState;
  }

  const pool = getPool();
  if (!pool) {
    return { ...memoryState, currentMember: member };
  }

  await ensureSeedData(member);

  const [risksResult, auditResult, executionResult] = await Promise.all([
    pool.query("select * from infrastructure_risks where workspace_id = $1 order by detected_at desc", [member.workspaceId]),
    pool.query("select * from audit_events where workspace_id = $1 order by created_at desc limit 50", [member.workspaceId]),
    pool.query("select * from execution_events where workspace_id = $1 order by created_at desc limit 50", [member.workspaceId]),
  ]);

  return {
    workspace: demoWorkspace,
    currentMember: member,
    risks: risksResult.rows.map(mapRiskRow),
    auditEvents: auditResult.rows.map(mapAuditRow),
    executionEvents: executionResult.rows.map(mapExecutionRow),
  };
}

export async function resetRiskScan(member: WorkspaceMember): Promise<PlatformState> {
  const freshState = createDemoPlatformState(member);

  if (!isPostgresEnabled()) {
    memoryState = {
      ...freshState,
      auditEvents: [
        {
          id: "audit-scan-reset",
          riskId: "scan",
          riskTitle: "Risk scan reset",
          action: "scan",
          actor: "CloudOps AI",
          detail: `${freshState.risks.length} infrastructure risks restored for demo review.`,
          createdAt: nowLabel(),
        },
      ],
    };
    return memoryState;
  }

  const pool = getPool();
  if (!pool) {
    return freshState;
  }

  await ensureSeedData(member);
  await pool.query("delete from infrastructure_risks where workspace_id = $1", [member.workspaceId]);
  await Promise.all(freshState.risks.map((risk) => upsertRisk(member.workspaceId, risk)));
  await insertAuditEvent(member.workspaceId, {
    id: `audit-scan-reset-${Date.now()}`,
    riskId: "scan",
    riskTitle: "Risk scan reset",
    action: "scan",
    actor: "CloudOps AI",
    detail: `${freshState.risks.length} infrastructure risks restored for review.`,
    createdAt: nowLabel(),
  });

  return getPlatformState(member);
}

export async function updateRisk(member: WorkspaceMember, riskId: string, status: RiskStatus): Promise<PlatformState> {
  const existingState = await getPlatformState(member);
  const risk = existingState.risks.find((item) => item.id === riskId);

  if (!risk) {
    return existingState;
  }

  const updatedRisk = { ...risk, status };
  const auditEvent = buildAuditEvent(member, updatedRisk, status);
  const executionEvent = status === "executed" ? buildExecutionEvent(updatedRisk) : null;

  if (!isPostgresEnabled()) {
    memoryState = {
      ...existingState,
      risks: existingState.risks.map((item) => (item.id === riskId ? updatedRisk : item)),
      auditEvents: [auditEvent, ...existingState.auditEvents],
      executionEvents: executionEvent ? [executionEvent, ...existingState.executionEvents] : existingState.executionEvents,
    };
    return memoryState;
  }

  const pool = getPool();
  if (!pool) {
    return existingState;
  }

  await pool.query("update infrastructure_risks set status = $1, updated_at = now() where workspace_id = $2 and id = $3", [status, member.workspaceId, riskId]);
  await insertAuditEvent(member.workspaceId, auditEvent);

  if (executionEvent) {
    await pool.query(
      `insert into execution_events (id, workspace_id, risk_id, title, owner, mode, command_preview, steps)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        executionEvent.id,
        member.workspaceId,
        executionEvent.riskId,
        executionEvent.title,
        executionEvent.owner,
        executionEvent.mode,
        executionEvent.commandPreview ?? null,
        JSON.stringify(executionEvent.steps),
      ],
    );
  }

  return getPlatformState(member);
}

async function ensureSeedData(member: WorkspaceMember) {
  const pool = getPool();
  if (!pool) {
    return;
  }

  await pool.query(
    `insert into workspaces (id, name, plan)
     values ($1, $2, $3)
     on conflict (id) do update set name = excluded.name, plan = excluded.plan`,
    [demoWorkspace.id, demoWorkspace.name, demoWorkspace.plan],
  );

  await pool.query(
    `insert into workspace_members (id, workspace_id, email, name, role)
     values ($1, $2, $3, $4, $5)
     on conflict (workspace_id, email) do update set name = excluded.name, role = excluded.role`,
    [member.id, member.workspaceId, member.email, member.name, member.role],
  );

  const countResult = await pool.query("select count(*)::int as count from infrastructure_risks where workspace_id = $1", [member.workspaceId]);

  if (countResult.rows[0]?.count === 0) {
    const demoState = createDemoPlatformState(member);
    await Promise.all(demoState.risks.map((risk) => upsertRisk(member.workspaceId, risk)));
    await Promise.all(demoState.auditEvents.map((event) => insertAuditEvent(member.workspaceId, event)));
  }
}

async function upsertRisk(workspaceId: string, risk: InfrastructureRisk) {
  const pool = getPool();
  if (!pool) {
    return;
  }

  await pool.query(
    `insert into infrastructure_risks
      (id, workspace_id, source, service, owner, title, detail, category, severity, evidence, detected_at, impact, recommendation, status, approval_required, routed_to)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13::jsonb, $14, $15, $16)
     on conflict (id) do update set
       status = excluded.status,
       updated_at = now()`,
    [
      risk.id,
      workspaceId,
      risk.source,
      risk.service,
      risk.owner,
      risk.title,
      risk.detail,
      risk.category,
      risk.severity,
      JSON.stringify(risk.evidence),
      risk.detectedAt,
      risk.impact,
      JSON.stringify(risk.recommendation),
      risk.status,
      risk.approvalRequired,
      risk.routedTo,
    ],
  );
}

async function insertAuditEvent(workspaceId: string, event: AuditEvent) {
  const pool = getPool();
  if (!pool) {
    return;
  }

  await pool.query(
    `insert into audit_events (id, workspace_id, risk_id, risk_title, action, actor, detail)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (id) do nothing`,
    [event.id, workspaceId, event.riskId, event.riskTitle, event.action, event.actor, event.detail],
  );
}

function buildAuditEvent(member: WorkspaceMember, risk: InfrastructureRisk, status: RiskStatus): AuditEvent {
  const detailByStatus: Record<RiskStatus, string> = {
    open: `${risk.title} was reopened for review.`,
    needs_approval: `${risk.title} is waiting for approval.`,
    approved: `${risk.recommendation.executionMode.replace("_", " ")} remediation approved for ${risk.routedTo}. Execution is queued behind the safety gate.`,
    dismissed: `Risk dismissed after review. No execution will be triggered for ${risk.service}.`,
    executed: `${risk.recommendation.executionMode.replace("_", " ")} remediation executed in simulation mode with audit evidence captured.`,
  };

  return {
    id: `audit-${risk.id}-${status}-${Date.now()}`,
    riskId: risk.id,
    riskTitle: risk.title,
    action: status === "approved" || status === "dismissed" || status === "executed" ? status : "scan",
    actor: member.name,
    detail: detailByStatus[status],
    createdAt: nowLabel(),
  };
}

function buildExecutionEvent(risk: InfrastructureRisk): ExecutionEvent {
  return {
    id: `execution-${risk.id}-${Date.now()}`,
    riskId: risk.id,
    title: risk.title,
    owner: risk.routedTo,
    mode: risk.recommendation.executionMode,
    commandPreview: risk.recommendation.commandPreview,
    steps: ["Approval token verified", "Safety checks passed", "Command preview recorded", "Simulated remediation completed"],
    createdAt: nowLabel(),
  };
}

function mapRiskRow(row: Record<string, unknown>): InfrastructureRisk {
  return {
    id: String(row.id),
    source: row.source as InfrastructureRisk["source"],
    service: String(row.service),
    owner: String(row.owner),
    title: String(row.title),
    detail: String(row.detail),
    category: row.category as InfrastructureRisk["category"],
    severity: row.severity as InfrastructureRisk["severity"],
    evidence: Array.isArray(row.evidence) ? row.evidence.map(String) : [],
    detectedAt: new Date(String(row.detected_at)).toISOString(),
    impact: String(row.impact),
    recommendation: row.recommendation as InfrastructureRisk["recommendation"],
    status: row.status as RiskStatus,
    approvalRequired: true,
    routedTo: String(row.routed_to),
  };
}

function mapAuditRow(row: Record<string, unknown>): AuditEvent {
  return {
    id: String(row.id),
    riskId: String(row.risk_id),
    riskTitle: String(row.risk_title),
    action: row.action as AuditEvent["action"],
    actor: String(row.actor),
    detail: String(row.detail),
    createdAt: new Date(String(row.created_at)).toLocaleString(),
  };
}

function mapExecutionRow(row: Record<string, unknown>): ExecutionEvent {
  return {
    id: String(row.id),
    riskId: String(row.risk_id),
    title: String(row.title),
    owner: String(row.owner),
    mode: row.mode as ExecutionEvent["mode"],
    commandPreview: row.command_preview ? String(row.command_preview) : undefined,
    steps: Array.isArray(row.steps) ? row.steps.map(String) : [],
    createdAt: new Date(String(row.created_at)).toLocaleString(),
  };
}
