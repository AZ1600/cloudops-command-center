import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoPlatformState, demoMember } from "@/lib/platform-state";
import type { InfrastructureRisk, WorkspaceMember } from "@/lib/types";

let repo: typeof import("@/lib/repository");
const member = (workspaceId: string, name = "Owner"): WorkspaceMember => ({ ...demoMember, id: "shared-user", workspaceId, name });
const a = member("workspace-a", "Owner A");
const b = member("workspace-b", "Owner B");
const risk = (title = "A finding", id = "same-source-id"): InfrastructureRisk => ({ ...createDemoPlatformState().risks[0], id, title });
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "");
  repo = await import("@/lib/repository");
});

afterEach(() => vi.unstubAllEnvs());

describe("workspace isolation in memory", () => {
  it("starts non-demo workspaces empty with their own identity", async () => {
    for (const user of [a,b]) expect(await repo.getPlatformState(user)).toMatchObject({ workspace: { id: user.workspaceId }, risks: [], auditEvents: [], executionEvents: [] });
    expect((await repo.getPlatformState(demoMember)).risks).toHaveLength(5);
  });
  it("keeps the same finding ID independent across imports, approvals and execution", async () => {
    await repo.importPlatformPilotRisk(a, risk("A only"));
    await repo.importPlatformPilotRisk(b, risk("B only"));
    await repo.updateRisk(a, "same-source-id", "approved", "a-approval");
    await repo.updateRisk(a, "same-source-id", "executed", "a-execution");
    const stateB = await repo.getPlatformState(b);
    expect(stateB.risks).toHaveLength(1);
    expect(stateB.risks[0]).toMatchObject({ title: "B only", status: "needs_approval" });
    expect(stateB.auditEvents.every(e => e.actor !== "Owner A")).toBe(true);
    expect(stateB.executionEvents).toEqual([]);
    const stateA = await repo.getPlatformState(a);
    expect(stateA.risks[0].status).toBe("executed");
    expect(stateA.executionEvents[0]).toMatchObject({ requestedBy: "Owner A", approvedBy: "Owner A", approvalRequestId: "a-approval" });
  });
  it("cannot update a risk belonging only to another workspace", async () => {
    await repo.importPlatformPilotRisk(a, risk());
    expect((await repo.updateRisk(b, "same-source-id", "dismissed")).risks).toEqual([]);
    expect((await repo.getPlatformState(a)).risks[0].status).toBe("needs_approval");
  });
  it("preserves decisions on repeated imports only inside their workspace", async () => {
    await repo.importPlatformPilotRisk(a, risk());
    await repo.updateRisk(a, "same-source-id", "approved");
    await repo.importPlatformPilotRisk(a, risk("Refreshed A evidence"));
    await repo.importPlatformPilotRisk(b, risk("New B finding"));
    expect((await repo.getPlatformState(a)).risks[0]).toMatchObject({ title: "Refreshed A evidence", status: "approved" });
    expect((await repo.getPlatformState(b)).risks[0].status).toBe("needs_approval");
  });
  it("does not retain mutations to imported records or returned nested data", async () => {
    const input = risk();
    const imported = await repo.importPlatformPilotRisk(a, input);
    input.evidence.push("injected");
    imported.risks[0].recommendation.steps.push("injected");
    imported.risks[0].title = "injected";
    imported.currentMember.role = "viewer";
    imported.workspace.id = b.workspaceId;
    const read = await repo.getPlatformState(a);
    expect(read.risks[0]).toEqual(risk());
    expect(read.workspace.id).toBe(a.workspaceId);
    expect(read.currentMember.role).toBe("owner");
  });
  it("does not lose concurrent imports into the same workspace", async () => {
    await Promise.all(Array.from({length: 12}, (_, i) => repo.importPlatformPilotRisk(a, risk("A", `concurrent-${i}`))));
    expect((await repo.getPlatformState(a)).risks).toHaveLength(12);
    expect((await repo.getPlatformState(b)).risks).toEqual([]);
  });
  it("restricts demo reset and leaves other workspace state untouched", async () => {
    await repo.importPlatformPilotRisk(a, risk());
    const before = await repo.getPlatformState(a);
    await repo.resetRiskScan(demoMember);
    expect(await repo.getPlatformState(a)).toEqual(before);
    await expect(repo.resetRiskScan(a)).rejects.toMatchObject({status: 403});
    await expect(repo.resetRiskScan({...demoMember, role: "viewer"})).rejects.toMatchObject({status: 403});
  });
  it("does not share a caller identity between readers of the same workspace", async () => {
    const viewer = {...a, id: "viewer", name: "Viewer", role: "viewer" as const};
    expect((await repo.getPlatformState(viewer)).currentMember.role).toBe("viewer");
    expect((await repo.getPlatformState(a)).currentMember.role).toBe("owner");
  });
});
