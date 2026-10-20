import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoMember, createDemoPlatformState } from "@/lib/platform-state";
import type { WorkspaceMember } from "@/lib/types";

const auth = vi.hoisted(() => ({ member: undefined as WorkspaceMember | undefined }));
vi.mock("@/lib/auth", () => ({ getCurrentMember: async () => auth.member }));
const a: WorkspaceMember = {...demoMember, workspaceId: "workspace-a", name: "Owner A"};
const b: WorkspaceMember = {...demoMember, workspaceId: "workspace-b", name: "Owner B"};
let repo: typeof import("@/lib/repository");
let read: typeof import("@/app/api/platform-state/route");
let patch: typeof import("@/app/api/risks/[riskId]/route");
let reset: typeof import("@/app/api/risk-scan/route");
let ingest: typeof import("@/app/api/platform-pilot/findings/route");
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PLATFORM_PILOT_WORKSPACE_ID", "workspace-b");
  vi.stubEnv("PLATFORM_PILOT_INGEST_TOKEN", "local-test-only");
  auth.member = b;
  repo = await import("@/lib/repository");
  read = await import("@/app/api/platform-state/route");
  patch = await import("@/app/api/risks/[riskId]/route");
  reset = await import("@/app/api/risk-scan/route");
  ingest = await import("@/app/api/platform-pilot/findings/route");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("workspace boundary through API routes", () => {
  it("returns only the assigned workspace and prevents caching successful reads", async () => {
    await repo.importPlatformPilotRisk(a, {...createDemoPlatformState().risks[0], id: "a-private"});
    const response = await read.GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({workspace: {id: b.workspaceId}, risks: [], auditEvents: []});
  });
  it("returns 404 for a foreign risk even with a forged workspace and role in the body", async () => {
    await repo.importPlatformPilotRisk(a, {...createDemoPlatformState().risks[0], id: "a-private"});
    const response = await patch.PATCH(new Request("https://example.test/api/risks/a-private", {
      method: "PATCH", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({status: "approved", workspaceId: a.workspaceId, role: "owner"}),
    }), {params: Promise.resolve({riskId: "a-private"})});
    expect(response.status).toBe(404);
    expect((await repo.getPlatformState(a)).risks[0].status).toBe("needs_approval");
    expect((await repo.getPlatformState(b)).auditEvents).toEqual([]);
  });
  it("returns an uncached 403 for demo reset from a non-demo workspace", async () => {
    const response = await reset.POST();
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await repo.getPlatformState(b)).risks).toEqual([]);
  });
  it("uses the integration target workspace independently of the browser identity", async () => {
    auth.member = a;
    const finding = (await import("@/contracts/examples/platform-pilot-valid.json")).default;
    const response = await ingest.POST(new Request("https://example.test/api/platform-pilot/findings", {
      method: "POST", headers: {"Content-Type": "application/json", Authorization: "Bearer local-test-only"},
      body: JSON.stringify(finding),
    }));
    expect(response.status).toBe(200);
    expect((await repo.getPlatformState(a)).risks).toEqual([]);
    expect((await repo.getPlatformState(b)).risks).toHaveLength(1);
  });
});
