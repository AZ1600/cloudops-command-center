import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentMember } from "@/lib/auth";
import { GET as readState } from "@/app/api/platform-state/route";
import { POST as scan } from "@/app/api/risk-scan/route";
import { POST as github } from "@/app/api/github-actions/route";
import { POST as terraform } from "@/app/api/terraform-plan/route";
import { PATCH as updateRisk } from "@/app/api/risks/[riskId]/route";
import { POST as ingest } from "@/app/api/platform-pilot/findings/route";
import validFinding from "@/contracts/examples/platform-pilot-valid.json";
import proxy from "@/proxy";
import { NextRequest, type NextFetchEvent } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), user: vi.fn(), read: vi.fn(), scan: vi.fn(), update: vi.fn(),
  githubImport: vi.fn(), terraformImport: vi.fn(), ingest: vi.fn(), fetchGithub: vi.fn(), parsePlan: vi.fn(),
  middleware: vi.fn(() => new Response(null, { status: 200 })),
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth, currentUser: mocks.user, clerkMiddleware: () => mocks.middleware,
}));
vi.mock("@/lib/repository", () => ({
  getPlatformState: mocks.read, resetRiskScan: mocks.scan, updateRisk: mocks.update,
  importGitHubActionsRisks: mocks.githubImport, importTerraformRisks: mocks.terraformImport,
  importPlatformPilotRisk: mocks.ingest,
}));
vi.mock("@/lib/github-actions", () => ({ fetchGitHubActionsRisks: mocks.fetchGithub }));
vi.mock("@/lib/terraform-plan", () => ({ parseTerraformPlan: mocks.parsePlan }));

function setUser(role = "viewer") {
  mocks.auth.mockResolvedValue({ userId: "user-fixture" });
  mocks.user.mockResolvedValue({
    id: "user-fixture", publicMetadata: { workspaceId: "workspace-team", role },
    primaryEmailAddressId: "email",
    emailAddresses: [{ id: "email", emailAddress: "member@example.test", verification: { status: "verified" } }],
    fullName: "Test Member",
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
  vi.stubEnv("PLATFORM_PILOT_INGEST_TOKEN", "integration-test-token");
  vi.stubEnv("PLATFORM_PILOT_WORKSPACE_ID", "workspace-integration");
  setUser();
  mocks.read.mockResolvedValue({ risks: [{ id: "risk-test", status: "approved" }] });
  mocks.ingest.mockResolvedValue({ risks: [] });
  mocks.scan.mockResolvedValue({ risks: [] });
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function request(path: string, body = "{") {
  return new Request("https://cloudops.example" + path, {
    method: "POST", headers: { "Content-Type": "application/json", "x-request-id": "auth-boundary-test" }, body,
  });
}
const routes = [
  ["read workspace", () => readState()],
  ["reset scan", () => scan()],
  ["import GitHub", () => github(request("/api/github-actions"))],
  ["import Terraform", () => terraform(request("/api/terraform-plan"))],
  ["change risk", () => updateRisk(request("/api/risks/risk-test"), { params: Promise.resolve({ riskId: "risk-test" }) })],
] as const;
function expectNoOperations() {
  for (const fn of [mocks.read, mocks.scan, mocks.update, mocks.githubImport, mocks.terraformImport, mocks.fetchGithub, mocks.parsePlan]) {
    expect(fn).not.toHaveBeenCalled();
  }
}
describe("browser API access before body parsing and repository work", () => {
  it.each(routes)("returns 401 for unauthenticated %s", async (_name, call) => {
    mocks.auth.mockResolvedValue({ userId: null });
    const response = await call();
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expectNoOperations();
  });
  it.each(routes)("returns 503 for unconfigured production %s", async (_name, call) => {
    vi.stubEnv("CLERK_SECRET_KEY", "");
    const response = await call();
    expect(response.status).toBe(503);
    expectNoOperations();
  });
  it.each(routes)("returns 403 for missing role on %s", async (_name, call) => {
    setUser("unsupported");
    expect((await call()).status).toBe(403);
    expectNoOperations();
  });
  it.each([
    ["reset", () => scan()],
    ["GitHub import", () => github(request("/api/github-actions"))],
    ["Terraform import", () => terraform(request("/api/terraform-plan"))],
  ] as const)("rejects viewer %s before reading a malformed body", async (_name, call) => {
    expect((await call()).status).toBe(403);
    expectNoOperations();
  });
  it("allows an assigned viewer to read their workspace", async () => {
    expect((await readState()).status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "workspace-team", role: "viewer" }));
  });
  it.each(["approved", "dismissed", "executed"])("rejects viewer status %s without repository work", async (status) => {
    const response = await updateRisk(request("/api/risks/risk-test", JSON.stringify({ status })), {
      params: Promise.resolve({ riskId: "risk-test" }),
    });
    expect(response.status).toBe(403);
    expectNoOperations();
  });
  it("allows only an owner to reset a scan", async () => {
    setUser("admin");
    expect((await scan()).status).toBe(403);
    setUser("owner");
    expect((await scan()).status).toBe(200);
    expect(mocks.scan).toHaveBeenCalledOnce();
  });
  it("preserves request correlation IDs on authentication rejection", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const response = await github(request("/api/github-actions"));
    expect(response.headers.get("x-request-id")).toBe("auth-boundary-test");
  });
});

function ingestionRequest(token: string | null = "integration-test-token") {
  return new Request("https://cloudops.example/api/platform-pilot/findings", {
    method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: JSON.stringify(validFinding),
  });
}
describe("PlatformPilot service authentication is independent from browser sessions", () => {
  it("accepts a valid token for the server-assigned workspace without calling Clerk", async () => {
    mocks.auth.mockRejectedValue(new Error("Clerk unavailable"));
    const response = await ingest(ingestionRequest());
    expect(response.status).toBe(200);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.ingest).toHaveBeenCalledWith(
      expect.objectContaining({ id: "integration-platform-pilot", workspaceId: "workspace-integration", role: "viewer" }),
      expect.objectContaining({ status: "needs_approval", approvalRequired: true }),
    );
  });
  it.each([null, "invalid-token"])("rejects invalid ingestion credentials %j without Clerk or repository access", async (token) => {
    expect((await ingest(ingestionRequest(token))).status).toBe(401);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it.each([undefined, "", "workspace/foreign"])("rejects missing or invalid integration workspace %j", async (workspace) => {
    vi.stubEnv("PLATFORM_PILOT_WORKSPACE_ID", workspace);
    expect((await ingest(ingestionRequest())).status).toBe(503);
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it("does not grant browser access using only the integration token", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await getCurrentMember().catch((error) => error)).status).toBe(401);
  });
});

describe("Clerk proxy initialization", () => {
  it("passes browser routes through Clerk when both keys exist", async () => {
    await proxy(new NextRequest("https://cloudops.example/"), {} as NextFetchEvent);
    expect(mocks.middleware).toHaveBeenCalledOnce();
  });
  it("leaves integration token verification to its dedicated route", async () => {
    await proxy(new NextRequest("https://cloudops.example/api/platform-pilot/findings"), {} as NextFetchEvent);
    expect(mocks.middleware).not.toHaveBeenCalled();
  });
  it("keeps missing configuration available to route-level 503 handling", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "");
    await proxy(new NextRequest("https://cloudops.example/"), {} as NextFetchEvent);
    expect(mocks.middleware).not.toHaveBeenCalled();
  });
});
