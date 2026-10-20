import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool, isPostgresEnabled } from "@/lib/db";
import { isWorkspaceId } from "@/lib/auth-config";
import { WorkspaceAccessError } from "@/lib/auth-errors";
import { canApprove, canExecute } from "@/lib/permissions";
import { createDemoPlatformState, createEmptyPlatformState, demoWorkspace } from "@/lib/platform-state";
import type {
  AuditEvent, ExecutionEvent, GitHubActionsSummary, InfrastructureRisk,
  PlatformState, RiskStatus, TerraformPlanSummary, Workspace, WorkspaceMember,
} from "@/lib/types";

const memoryStates = new Map<string, PlatformState>();
const memoryQueues = new Map<string, Promise<void>>();

// Never return or retain references supplied by a caller, including nested evidence.
function snapshot<T>(value: T): T {
  return structuredClone(value);
}

type Operation = (state: PlatformState, client?: PoolClient) => Promise<PlatformState>;

async function withWorkspace(member: WorkspaceMember, operation: Operation): Promise<PlatformState> {
  member = snapshot(member);
  if (!isWorkspaceId(member.workspaceId)) {
    throw new WorkspaceAccessError(403, "Workspace access needs review.");
  }
  if (!isPostgresEnabled()) {
    const key = member.workspaceId;
    const previous = memoryQueues.get(key) ?? Promise.resolve();
    let unlock!: () => void;
    const current = new Promise<void>((resolve) => { unlock = resolve; });
    memoryQueues.set(key, current);
    await previous;
    try {
      const stored = memoryStates.get(key) ?? (
        key === demoWorkspace.id ? createDemoPlatformState(member) : createEmptyPlatformState(member)
      );
      const state = snapshot({ ...stored, currentMember: member });
      const next = await operation(state);
      memoryStates.set(key, snapshot(next));
      return snapshot(next);
    } finally {
      unlock();
      if (memoryQueues.get(key) === current) memoryQueues.delete(key);
    }
  }

  const pool = getPool();
  if (!pool) throw new WorkspaceAccessError(503, "Workspace storage is unavailable.");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const workspace = await prepareWorkspace(client, member);
    const state = await readState(client, workspace, member);
    await operation(state, client);
    const result = await readState(client, workspace, member);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function prepareWorkspace(client: PoolClient, member: WorkspaceMember): Promise<Workspace> {
  if (member.workspaceId === demoWorkspace.id) {
    await client.query(
      `insert into workspaces (id, name, plan) values ($1, $2, $3) on conflict (id) do nothing`,
      [demoWorkspace.id, demoWorkspace.name, demoWorkspace.plan],
    );
  }
  // Serialize operations within this workspace, including its initial demo seeding.
  const result = await client.query(
    `select id, name, plan, demo_seeded_at from workspaces where id = $1 for update`,
    [member.workspaceId],
  );
  const row = result.rows[0];
  if (!row) throw new WorkspaceAccessError(403, "Workspace has not been provisioned.");
  await client.query(
    `insert into workspace_members (id, workspace_id, email, name, role)
     values ($1, $2, $3, $4, $5)
     on conflict (workspace_id, id) do update set
       email = excluded.email, name = excluded.name, role = excluded.role`,
    [member.id, member.workspaceId, member.email, member.name, member.role],
  );
  if (row.id === demoWorkspace.id && !row.demo_seeded_at) {
    const demo = createDemoPlatformState(member);
    for (const risk of demo.risks) await insertRisk(client, member.workspaceId, risk, true);
    for (const event of demo.auditEvents) await insertAuditEvent(client, member.workspaceId, event);
    await client.query(`update workspaces set demo_seeded_at = now() where id = $1`, [member.workspaceId]);
  }
  return { id: row.id, name: row.name, plan: row.plan };
}

async function readState(client: PoolClient, workspace: Workspace, member: WorkspaceMember): Promise<PlatformState> {
  const risks = await client.query(
    `select * from infrastructure_risks where workspace_id = $1 order by detected_at desc, id`, [member.workspaceId],
  );
  const audits = await client.query(
    `select * from audit_events where workspace_id = $1 order by created_at desc, id desc limit 50`, [member.workspaceId],
  );
  const executions = await client.query(
    `select * from execution_events where workspace_id = $1 order by created_at desc, id desc limit 50`, [member.workspaceId],
  );
  return {
    workspace, currentMember: snapshot(member), risks: risks.rows.map(mapRiskRow),
    auditEvents: audits.rows.map(mapAuditRow), executionEvents: executions.rows.map(mapExecutionRow),
  };
}

export async function getPlatformState(member: WorkspaceMember): Promise<PlatformState> {
  return withWorkspace(member, async (state) => state);
}

export async function resetRiskScan(member: WorkspaceMember): Promise<PlatformState> {
  if (member.workspaceId !== demoWorkspace.id || member.role !== "owner") {
    throw new WorkspaceAccessError(403, "Only the demo workspace owner can reset the demo scan.");
  }
  return withWorkspace(member, async (state, client) => {
    const fresh = createDemoPlatformState(member);
    const event: AuditEvent = {
      id: `audit-scan-reset-${randomUUID()}`, riskId: "scan", riskTitle: "Risk scan reset",
      action: "scan", actor: member.name,
      detail: `${fresh.risks.length} demonstration risks restored for review.`,
      createdAt: new Date().toISOString(),
    };
    if (client) {
      await client.query(`delete from infrastructure_risks where workspace_id = $1`, [member.workspaceId]);
      for (const risk of fresh.risks) await insertRisk(client, member.workspaceId, risk);
      await insertAuditEvent(client, member.workspaceId, event);
    }
    return { ...state, risks: fresh.risks, auditEvents: [event, ...state.auditEvents] };
  });
}

export async function updateRisk(
  member: WorkspaceMember, riskId: string, status: RiskStatus,
  requestId = `repository-${randomUUID()}`,
): Promise<PlatformState> {
  return withWorkspace(member, async (state, client) => {
    const risk = state.risks.find((item) => item.id === riskId);
    if (!risk) return state;
    if (!canApprove(member.role) || (status === "executed" && !canExecute(member.role))) {
      throw new WorkspaceAccessError(403, "Role cannot change risk status.");
    }
    if (status === "executed" && risk.status !== "approved") {
      throw new WorkspaceAccessError(403, "Risk must be approved before execution.");
    }
    const updated = { ...risk, status };
    const audit = buildAuditEvent(member, updated, status, requestId);
    const approval = state.auditEvents.find((event) => event.riskId === riskId && event.action === "approved");
    const execution = status === "executed" ? buildExecutionEvent(member, risk, updated, approval, requestId) : undefined;
    if (client) {
      await client.query(
        `update infrastructure_risks set status = $1, updated_at = now() where workspace_id = $2 and id = $3`,
        [status, member.workspaceId, riskId],
      );
      await insertAuditEvent(client, member.workspaceId, audit);
      if (execution) await insertExecutionEvent(client, member.workspaceId, execution);
    }
    return {
      ...state, risks: state.risks.map((item) => item.id === riskId ? updated : item),
      auditEvents: [audit, ...state.auditEvents],
      executionEvents: execution ? [execution, ...state.executionEvents] : state.executionEvents,
    };
  });
}

export async function importTerraformRisks(member: WorkspaceMember, risks: InfrastructureRisk[], summary: TerraformPlanSummary) {
  return importDetectedRisks(member, risks, {
    id: `audit-terraform-import-${randomUUID()}`, riskId: "terraform-import", riskTitle: "Terraform plan imported",
    action: "scan", actor: member.name,
    detail: `${summary.totalChanges} Terraform changes reviewed. ${summary.generatedRisks} risks generated for owner approval.`,
    createdAt: new Date().toISOString(),
  });
}

export async function importGitHubActionsRisks(member: WorkspaceMember, risks: InfrastructureRisk[], summary: GitHubActionsSummary) {
  return importDetectedRisks(member, risks, {
    id: `audit-github-actions-import-${randomUUID()}`, riskId: "github-actions-import", riskTitle: "GitHub Actions runs imported",
    action: "scan", actor: member.name,
    detail: `${summary.totalRuns} workflow runs reviewed for ${summary.repository}. ${summary.generatedRisks} failed runs generated risks for owner approval.`,
    createdAt: new Date().toISOString(),
  });
}

export async function importPlatformPilotRisk(member: WorkspaceMember, risk: InfrastructureRisk) {
  return importDetectedRisks(member, [risk], {
    id: `audit-platform-pilot-import-${randomUUID()}`, riskId: risk.id, riskTitle: risk.title,
    action: "scan", actor: "PlatformPilot",
    detail: `PlatformPilot finding imported for ${risk.service}. Risk routed to ${risk.routedTo} and held for approval.`,
    createdAt: new Date().toISOString(),
  });
}

async function importDetectedRisks(member: WorkspaceMember, risks: InfrastructureRisk[], audit: AuditEvent): Promise<PlatformState> {
  risks = snapshot(risks);
  return withWorkspace(member, async (state, client) => {
    const byId = new Map(state.risks.map((risk) => [risk.id, risk]));
    for (const input of risks) {
      const risk = snapshot(input);
      const existing = byId.get(risk.id);
      // A repeated source finding must not revoke a decision already made here.
      if (existing) risk.status = existing.status;
      byId.set(risk.id, risk);
      if (client) await insertRisk(client, member.workspaceId, risk);
    }
    if (client) await insertAuditEvent(client, member.workspaceId, audit);
    return { ...state, risks: [...byId.values()], auditEvents: [audit, ...state.auditEvents] };
  });
}

async function insertRisk(client: PoolClient, workspaceId: string, risk: InfrastructureRisk, seedOnly = false) {
  await client.query(
    `insert into infrastructure_risks (
      id, workspace_id, source, service, owner, title, detail, category, severity,
      evidence, detected_at, impact, recommendation, status, approval_required, routed_to
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13::jsonb,$14,$15,$16)
    on conflict (workspace_id, id) do ${seedOnly ? "nothing" : `update set
      source = excluded.source, service = excluded.service, owner = excluded.owner,
      title = excluded.title, detail = excluded.detail, category = excluded.category,
      severity = excluded.severity, evidence = excluded.evidence, detected_at = excluded.detected_at,
      impact = excluded.impact, recommendation = excluded.recommendation,
      status = excluded.status, approval_required = excluded.approval_required,
      routed_to = excluded.routed_to, updated_at = now()`}`,
    [risk.id, workspaceId, risk.source, risk.service, risk.owner, risk.title, risk.detail,
      risk.category, risk.severity, JSON.stringify(risk.evidence), risk.detectedAt,
      risk.impact, JSON.stringify(risk.recommendation), risk.status, risk.approvalRequired, risk.routedTo],
  );
}

async function insertAuditEvent(client: PoolClient, workspaceId: string, event: AuditEvent) {
  await client.query(
    `insert into audit_events (id, workspace_id, risk_id, risk_title, action, actor, detail, request_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (workspace_id, id) do nothing`,
    [event.id, workspaceId, event.riskId, event.riskTitle, event.action, event.actor, event.detail, event.requestId ?? null],
  );
}

async function insertExecutionEvent(client: PoolClient, workspaceId: string, event: ExecutionEvent) {
  await client.query(
    `insert into execution_events (
      id, workspace_id, risk_id, title, owner, mode, command_preview, request_id, requested_by,
      approved_by, approved_at, approval_request_id, before_status, after_status, outcome, steps
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)`,
    [event.id, workspaceId, event.riskId, event.title, event.owner, event.mode,
      event.commandPreview ?? null, event.requestId, event.requestedBy, event.approvedBy,
      event.approvedAt === "Unknown" ? null : event.approvedAt, event.approvalRequestId ?? null,
      event.beforeStatus, event.afterStatus, event.outcome, JSON.stringify(event.steps)],
  );
}

function buildAuditEvent(
  member: WorkspaceMember,
  risk: InfrastructureRisk,
  status: RiskStatus,
  requestId: string,
): AuditEvent {
  const detailByStatus: Record<
    RiskStatus,
    string
  > = {
    open:
      `${risk.title} was reopened for review.`,
    needs_approval:
      `${risk.title} is waiting for approval.`,
    approved:
      `${risk.recommendation.executionMode.replace("_", " ")} ` +
      `remediation approved for ${risk.routedTo}. ` +
      `Execution is queued behind the safety gate.`,
    dismissed:
      `Risk dismissed after review. ` +
      `No execution will be triggered for ${risk.service}.`,
    executed:
      `${risk.recommendation.executionMode.replace("_", " ")} ` +
      `remediation executed in simulation mode with audit evidence captured.`,
  };

  return {
    id:
      `audit-${risk.id}-${status}-` +
      `${randomUUID()}`,
    riskId: risk.id,
    riskTitle: risk.title,
    action:
      status === "approved" ||
      status === "dismissed" ||
      status === "executed"
        ? status
        : "scan",
    actor: member.name,
    detail: detailByStatus[status],
    requestId,
    createdAt: new Date().toISOString(),
  };
}

function buildExecutionEvent(
  member: WorkspaceMember,
  previousRisk: InfrastructureRisk,
  updatedRisk: InfrastructureRisk,
  approvalEvent: AuditEvent | undefined,
  requestId: string,
): ExecutionEvent {
  return {
    id:
      `execution-${updatedRisk.id}-` +
      `${randomUUID()}`,
    riskId: updatedRisk.id,
    title: updatedRisk.title,
    owner: updatedRisk.routedTo,
    mode:
      updatedRisk.recommendation
        .executionMode,
    commandPreview:
      updatedRisk.recommendation
        .commandPreview,

    requestId,
    requestedBy: member.name,

    approvedBy:
      approvalEvent?.actor ??
      "Unknown approver",

    approvedAt:
      approvalEvent?.createdAt ??
      "Unknown",

    approvalRequestId:
      approvalEvent?.requestId,

    beforeStatus: previousRisk.status,
    afterStatus: updatedRisk.status,
    outcome: "succeeded",

    steps: [
      "Approval evidence verified",
      "Execution permission verified",
      "Safety checks passed",
      "Command preview recorded",
      "Simulated remediation completed",
      "Execution evidence persisted",
    ],

    createdAt:
      new Date().toISOString(),
  };
}

function mapRiskRow(
  row: Record<string, unknown>,
): InfrastructureRisk {
  return {
    id: String(row.id),
    source:
      row.source as InfrastructureRisk["source"],
    service: String(row.service),
    owner: String(row.owner),
    title: String(row.title),
    detail: String(row.detail),
    category:
      row.category as InfrastructureRisk["category"],
    severity:
      row.severity as InfrastructureRisk["severity"],
    evidence: Array.isArray(row.evidence)
      ? row.evidence.map(String)
      : [],
    detectedAt:
      new Date(
        String(row.detected_at),
      ).toISOString(),
    impact: String(row.impact),
    recommendation:
      row.recommendation as InfrastructureRisk["recommendation"],
    status:
      row.status as RiskStatus,
    approvalRequired: true,
    routedTo:
      String(row.routed_to),
  };
}

function mapAuditRow(
  row: Record<string, unknown>,
): AuditEvent {
  return {
    id: String(row.id),
    riskId: String(row.risk_id),
    riskTitle:
      String(row.risk_title),
    action:
      row.action as AuditEvent["action"],
    actor: String(row.actor),
    detail: String(row.detail),
    requestId: row.request_id
      ? String(row.request_id)
      : undefined,
    createdAt:
      new Date(
        String(row.created_at),
      ).toISOString(),
  };
}

function mapExecutionRow(
  row: Record<string, unknown>,
): ExecutionEvent {
  return {
    id: String(row.id),
    riskId: String(row.risk_id),
    title: String(row.title),
    owner: String(row.owner),
    mode:
      row.mode as ExecutionEvent["mode"],
    commandPreview:
      row.command_preview
        ? String(row.command_preview)
        : undefined,

    requestId:
      row.request_id
        ? String(row.request_id)
        : "legacy-execution",

    requestedBy:
      row.requested_by
        ? String(row.requested_by)
        : "Unknown actor",

    approvedBy:
      row.approved_by
        ? String(row.approved_by)
        : "Unknown approver",

    approvedAt:
      row.approved_at
        ? new Date(
            String(row.approved_at),
          ).toISOString()
        : "Unknown",

    approvalRequestId:
      row.approval_request_id
        ? String(
            row.approval_request_id,
          )
        : undefined,

    beforeStatus:
      row.before_status
        ? (row.before_status as RiskStatus)
        : "approved",

    afterStatus:
      row.after_status
        ? (row.after_status as RiskStatus)
        : "executed",

    outcome:
      row.outcome
        ? (row.outcome as ExecutionEvent["outcome"])
        : "succeeded",

    steps: Array.isArray(row.steps)
      ? row.steps.map(String)
      : [],

    createdAt:
      new Date(
        String(row.created_at),
      ).toISOString(),
  };
}