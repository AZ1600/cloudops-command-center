import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createDemoPlatformState, demoMember } from "@/lib/platform-state";
import type { InfrastructureRisk, WorkspaceMember } from "@/lib/types";

const testUrl = process.env.CLOUDOPS_TEST_DATABASE_URL;
if (!testUrl) throw new Error("CLOUDOPS_TEST_DATABASE_URL is required. Use the disposable compose.test.yml database.");
const target = new URL(testUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.pathname !== "/cloudops_test") {
  throw new Error("Integration tests require a local database named cloudops_test; refusing this connection.");
}
const schema = `isolation_${randomUUID().replaceAll("-", "")}`;
const admin = new pg.Client({ connectionString: testUrl, ssl: false });
let repo: typeof import("@/lib/repository");
let schemaSql: string;
const a: WorkspaceMember = {...demoMember, id: "same-user", workspaceId: "workspace-a", name: "Owner A"};
const b: WorkspaceMember = {...a, workspaceId: "workspace-b", name: "Owner B"};
const risk = (title = "A finding", id = "same-source-id"): InfrastructureRisk => ({...createDemoPlatformState().risks[0], id, title});

beforeAll(async () => {
  await admin.connect();
  await admin.query(`create schema ${schema}`);
  await admin.query(`set search_path to ${schema}`);
  schemaSql = await readFile(new URL("../../db/schema.sql", import.meta.url), "utf8");
  await admin.query(schemaSql);
  const scoped = new URL(testUrl!);
  scoped.searchParams.set("options", `-c search_path=${schema}`);
  vi.stubEnv("DATABASE_URL", scoped.toString());
  vi.stubEnv("DATABASE_SSL", "false");
  vi.resetModules();
  repo = await import("@/lib/repository");
});
beforeEach(async () => {
  await admin.query("truncate workspaces cascade");
  await admin.query("insert into workspaces (id, name, plan) values ('workspace-a', 'Team A', 'team'), ('workspace-b', 'Team B', 'starter')");
});
afterAll(async () => {
  const { getPool } = await import("@/lib/db");
  await getPool()?.end();
  delete globalThis.cloudopsPool;
  vi.unstubAllEnvs();
  await admin.query(`drop schema ${schema} cascade`);
  await admin.end();
});

describe("workspace isolation against PostgreSQL", () => {
  it("loads actual workspace metadata and leaves non-demo workspaces empty", async () => {
    expect(await repo.getPlatformState(a)).toMatchObject({ workspace: {id: "workspace-a", name: "Team A", plan: "team"}, risks: [], auditEvents: [] });
    expect(await repo.getPlatformState(b)).toMatchObject({ workspace: {id: "workspace-b", name: "Team B", plan: "starter"}, risks: [] });
    const members = await admin.query("select workspace_id, id from workspace_members order by workspace_id");
    expect(members.rows).toEqual([{workspace_id: a.workspaceId, id: a.id}, {workspace_id: b.workspaceId, id: b.id}]);
  });
  it("keeps identical source IDs, decisions, audit and execution history independent", async () => {
    await Promise.all([repo.importPlatformPilotRisk(a, risk("A only")), repo.importPlatformPilotRisk(b, risk("B only"))]);
    await repo.updateRisk(a, "same-source-id", "approved", "a-approval");
    await repo.updateRisk(a, "same-source-id", "executed", "a-execution");
    const stateA = await repo.getPlatformState(a);
    const stateB = await repo.getPlatformState(b);
    expect(stateA.risks[0]).toMatchObject({title: "A only", status: "executed"});
    expect(stateB.risks[0]).toMatchObject({title: "B only", status: "needs_approval"});
    expect(stateA.executionEvents[0]).toMatchObject({requestedBy: "Owner A", approvedBy: "Owner A", approvalRequestId: "a-approval"});
    expect(stateB.executionEvents).toEqual([]);
    expect(stateB.auditEvents.some(event => event.actor === "Owner A")).toBe(false);
    expect((await admin.query("select count(*)::int as n from infrastructure_risks where id = 'same-source-id'")).rows[0].n).toBe(2);
  });
  it("cannot change a risk that only belongs to another workspace", async () => {
    await repo.importPlatformPilotRisk(a, risk());
    expect((await repo.updateRisk(b, "same-source-id", "dismissed")).risks).toEqual([]);
    expect((await repo.getPlatformState(a)).risks[0].status).toBe("needs_approval");
  });
  it("keeps decisions on source re-import without affecting the other workspace", async () => {
    await repo.importPlatformPilotRisk(a, risk());
    await repo.updateRisk(a, "same-source-id", "approved");
    await repo.importPlatformPilotRisk(a, risk("Refreshed A evidence"));
    await repo.importPlatformPilotRisk(b, risk("B only"));
    expect((await repo.getPlatformState(a)).risks[0]).toMatchObject({title: "Refreshed A evidence", status: "approved"});
    expect((await repo.getPlatformState(b)).risks[0].status).toBe("needs_approval");
  });
  it("uses composite IDs for audit and execution records", async () => {
    await Promise.all([repo.importPlatformPilotRisk(a, risk()), repo.importPlatformPilotRisk(b, risk())]);
    await admin.query(`insert into audit_events (id, workspace_id, risk_id, risk_title, action, actor, detail)
      values ('shared-audit', 'workspace-a', 'same-source-id', 'A', 'approved', 'A', 'A'),
             ('shared-audit', 'workspace-b', 'same-source-id', 'B', 'approved', 'B', 'B')`);
    await admin.query(`insert into execution_events (id, workspace_id, risk_id, title, owner, mode)
      values ('shared-execution', 'workspace-a', 'same-source-id', 'A', 'A', 'simulated'),
             ('shared-execution', 'workspace-b', 'same-source-id', 'B', 'B', 'simulated')`);
    expect((await repo.getPlatformState(a)).executionEvents[0].title).toBe("A");
    expect((await repo.getPlatformState(b)).executionEvents[0].title).toBe("B");
  });
  it("does not provision an unknown assigned workspace or leave a partial member", async () => {
    await expect(repo.getPlatformState({...a, workspaceId: "workspace-unknown"})).rejects.toMatchObject({status: 403});
    expect((await admin.query("select * from workspaces where id = 'workspace-unknown'")).rowCount).toBe(0);
    expect((await admin.query("select * from workspace_members")).rowCount).toBe(0);
  });
  it("does not rename an existing demo workspace or reseed it when emptied", async () => {
    await admin.query("insert into workspaces (id, name, plan) values ('workspace-demo', 'Preserved name', 'team')");
    expect((await repo.getPlatformState(demoMember)).workspace).toEqual({id: "workspace-demo", name: "Preserved name", plan: "team"});
    await admin.query("delete from infrastructure_risks where workspace_id = 'workspace-demo'");
    expect((await repo.getPlatformState(demoMember)).risks).toEqual([]);
  });
  it("restricts demo reset and preserves other workspace data and history", async () => {
    await repo.importPlatformPilotRisk(a, risk());
    await repo.updateRisk(a, "same-source-id", "approved");
    const before = await repo.getPlatformState(a);
    await repo.resetRiskScan(demoMember);
    expect(await repo.getPlatformState(a)).toEqual(before);
    await expect(repo.resetRiskScan(a)).rejects.toMatchObject({status: 403});
    expect(await repo.getPlatformState(a)).toEqual(before);
  });
  it("rolls back the risk update if audit persistence fails", async () => {
    await repo.importPlatformPilotRisk(a, risk());
    await admin.query(`create function reject_audit() returns trigger language plpgsql as $$ begin raise exception 'test rejection'; end $$`);
    await admin.query("create trigger reject_audit before insert on audit_events for each row execute function reject_audit()");
    try {
      await expect(repo.updateRisk(a, "same-source-id", "approved")).rejects.toThrow("test rejection");
      expect((await repo.getPlatformState(a)).risks[0].status).toBe("needs_approval");
    } finally {
      await admin.query("drop trigger reject_audit on audit_events");
      await admin.query("drop function reject_audit()");
    }
  });
  it("serializes concurrent imports without losing findings", async () => {
    await Promise.all(Array.from({length: 8}, (_, i) => repo.importPlatformPilotRisk(a, risk("A", `parallel-${i}`))));
    expect((await repo.getPlatformState(a)).risks).toHaveLength(8);
    expect((await repo.getPlatformState(b)).risks).toEqual([]);
  });
  it("provisions a workspace through the operator command without overwriting existing details", async () => {
    const run = promisify(execFile);
    const script = fileURLToPath(new URL("../../scripts/create-workspace.mjs", import.meta.url));
    const options = {env: {...process.env, DATABASE_URL: process.env.DATABASE_URL!, DATABASE_SSL: "false"}};
    await run(process.execPath, [script, "workspace-script", "Team's workspace", "team"], options);
    await run(process.execPath, [script, "workspace-script", "Do not replace", "enterprise"], options);
    const result = await repo.getPlatformState({...a, workspaceId: "workspace-script"});
    expect(result.workspace).toEqual({id: "workspace-script", name: "Team's workspace", plan: "team"});
    expect(result.risks).toEqual([]);
  });
  it("upgrades the original schema twice without losing existing records", async () => {
    const legacy = `${schema}_legacy`;
    await admin.query(`create schema ${legacy}`);
    await admin.query(`set search_path to ${legacy}`);
    try {
      await admin.query(await readFile(new URL("../fixtures/schema-before-workspace-isolation.sql", import.meta.url), "utf8"));
      await admin.query("insert into workspaces (id,name,plan) values ('workspace-demo','Legacy team','team'),('workspace-b','Other','starter')");
      await admin.query("insert into workspace_members (id,workspace_id,email,name,role) values ('same-user','workspace-demo','owner@example.test','Owner','owner')");
      await admin.query(`insert into infrastructure_risks (id,workspace_id,source,service,owner,title,detail,category,severity,detected_at,impact,recommendation,status,routed_to)
        values ('legacy-risk','workspace-demo','terraform','network','Owner','Legacy approved','Detail','security','high',now(),'Impact','{}','approved','Owner')`);
      await admin.query(`insert into audit_events (id,workspace_id,risk_id,risk_title,action,actor,detail) values ('legacy-audit','workspace-demo','legacy-risk','Legacy','approved','Owner','Preserved')`);
      await admin.query(`insert into execution_events (id,workspace_id,risk_id,title,owner,mode) values ('legacy-execution','workspace-demo','legacy-risk','Legacy','Owner','simulated')`);
      await admin.query(schemaSql);
      await admin.query(schemaSql);
      expect((await admin.query("select name, plan, demo_seeded_at from workspaces where id = 'workspace-demo'")).rows[0]).toMatchObject({name: "Legacy team", plan: "team", demo_seeded_at: expect.any(Date)});
      expect((await admin.query("select status from infrastructure_risks where id = 'legacy-risk'")).rows[0].status).toBe("approved");
      for (const table of ["workspace_members", "infrastructure_risks", "audit_events", "execution_events"]) {
        expect((await admin.query(`select count(*)::int as n from ${table}`)).rows[0].n).toBe(1);
      }
      await admin.query("insert into workspace_members (id,workspace_id,email,name,role) values ('same-user','workspace-b','owner@example.test','B','owner')");
      await admin.query(`insert into infrastructure_risks select id,'workspace-b',source,service,owner,title,detail,category,severity,evidence,detected_at,impact,recommendation,status,approval_required,routed_to,updated_at from infrastructure_risks where id='legacy-risk'`);
      expect((await admin.query("select count(*)::int as n from infrastructure_risks")).rows[0].n).toBe(2);
    } finally {
      await admin.query(`set search_path to ${schema}`);
      await admin.query(`drop schema ${legacy} cascade`);
    }
  });
});
