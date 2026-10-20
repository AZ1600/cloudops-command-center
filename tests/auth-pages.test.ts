import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import Login from "@/app/login/[[...login]]/page";
import { WorkspaceAccessError } from "@/lib/auth-errors";
import { AccessPanel } from "@/app/access-panel";
import { CloudOpsDashboard } from "@/app/cloudops-dashboard";

const mocks = vi.hoisted(() => ({
  member: vi.fn(), read: vi.fn(), signIn: vi.fn(), redirect: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentMember: mocks.member }));
vi.mock("@/lib/repository", () => ({ getPlatformState: mocks.read }));
vi.mock("@/app/cloudops-dashboard", () => ({ CloudOpsDashboard: () => null }));
vi.mock("@clerk/nextjs", () => ({ SignIn: mocks.signIn, SignOutButton: () => null }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { mocks.redirect(path); throw new Error("REDIRECT:" + path); },
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
});
afterEach(() => vi.unstubAllEnvs());

describe("workspace page does not read data before access is confirmed", () => {
  it.each([401, 403, 503] as const)("renders the access panel for status %s without loading the repository", async (status) => {
    const error = new WorkspaceAccessError(status, "Safe access error");
    mocks.member.mockRejectedValue(error);
    const page = await Home();
    expect(page.type).toBe(AccessPanel);
    expect(page.props.error).toBe(error);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("loads the assigned workspace only after obtaining a valid member", async () => {
    const member = { id: "user", role: "viewer", workspaceId: "workspace-team" };
    const state = { risks: [], currentMember: member };
    mocks.member.mockResolvedValue(member);
    mocks.read.mockResolvedValue(state);
    const page = await Home();
    expect(page.type).toBe(CloudOpsDashboard);
    expect(mocks.read).toHaveBeenCalledWith(member);
    expect(page.props.initialState).toBe(state);
  });
  it("does not turn repository failures into authentication or demo fallback", async () => {
    mocks.member.mockResolvedValue({ workspaceId: "workspace-team" });
    mocks.read.mockRejectedValue(new Error("repository unavailable"));
    await expect(Home()).rejects.toThrow("repository unavailable");
  });
});
describe("sign-in page navigation", () => {
  it.each([403, 503] as const)("does not send status %s into a sign-in redirect loop", async (status) => {
    mocks.member.mockRejectedValue(new WorkspaceAccessError(status, "Safe access error"));
    const page = await Login();
    expect(page.type).toBe(AccessPanel);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("redirects an authorized user to the workspace", async () => {
    mocks.member.mockResolvedValue({ role: "viewer" });
    await expect(Login()).rejects.toThrow("REDIRECT:/");
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });
});
