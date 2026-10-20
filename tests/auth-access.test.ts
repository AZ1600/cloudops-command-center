import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentMember } from "@/lib/auth";
import { WorkspaceAccessError } from "@/lib/auth-errors";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, currentUser: mocks.user }));

const makeUser = (role: unknown = "viewer", workspaceId: unknown = "workspace-team") => ({
  id: "user-verified",
  publicMetadata: { workspaceId, role },
  unsafeMetadata: { workspaceId: "workspace-attacker", role: "owner" },
  primaryEmailAddressId: "email-primary",
  emailAddresses: [
    { id: "email-primary", emailAddress: "member@example.test", verification: { status: "verified" } },
  ],
  fullName: "Verified Member",
  firstName: "Verified",
});

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
  mocks.auth.mockReset().mockResolvedValue({ userId: "user-verified" });
  mocks.user.mockReset().mockResolvedValue(makeUser());
});
afterEach(() => vi.unstubAllEnvs());

async function expectDenied(status: number) {
  await expect(getCurrentMember()).rejects.toMatchObject({ name: "WorkspaceAccessError", status });
}

describe("workspace identity boundary", () => {
  it.each(["development", "test"])("retains unconfigured %s demo access", async (environment) => {
    vi.stubEnv("NODE_ENV", environment);
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    expect(await getCurrentMember()).toMatchObject({ role: "owner", workspaceId: "workspace-demo" });
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("returns separate demo objects so a caller cannot alter the default identity", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    (await getCurrentMember()).role = "viewer";
    expect((await getCurrentMember()).role).toBe("owner");
  });
  it.each([
    ["", ""], ["pk_test_fixture", ""], ["", "sk_test_fixture"],
  ])("rejects missing or partial production keys", async (publishable, secret) => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", publishable);
    vi.stubEnv("CLERK_SECRET_KEY", secret);
    await expectDenied(503);
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("does not turn partial local configuration into demo access", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    await expectDenied(503);
  });
  it("rejects a missing session before fetching a user", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    await expectDenied(401);
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it("rejects a missing Clerk user", async () => {
    mocks.user.mockResolvedValue(null);
    await expectDenied(401);
  });
  it("rejects a user belonging to a different session", async () => {
    mocks.user.mockResolvedValue({ ...makeUser(), id: "other-user" });
    await expectDenied(401);
  });
  it.each(["auth", "user"] as const)("does not grant owner access when the %s lookup fails", async (operation) => {
    mocks[operation].mockRejectedValue(new Error("private-sdk-detail-and-secret"));
    await expect(getCurrentMember()).rejects.toEqual(
      new WorkspaceAccessError(503, "Authentication is temporarily unavailable."),
    );
  });
  it.each(["owner", "admin", "engineer", "viewer"])("preserves an explicitly assigned %s role", async (role) => {
    mocks.user.mockResolvedValue(makeUser(role));
    expect(await getCurrentMember()).toEqual({
      id: "user-verified", workspaceId: "workspace-team", role,
      email: "member@example.test", name: "Verified Member",
    });
  });
  it.each([undefined, null, "", "OWNER", "root", {}, 1])("rejects unknown role %j instead of elevating it", async (role) => {
    const user = makeUser();
    user.publicMetadata.role = role;
    mocks.user.mockResolvedValue(user);
    await expectDenied(403);
  });
  it.each([undefined, null, "", " ", {}, 2, "workspace/other", "workspace team", "a".repeat(129)])(
    "rejects invalid workspace assignment %j", async (workspace) => {
      const user = makeUser("viewer");
      user.publicMetadata.workspaceId = workspace;
      mocks.user.mockResolvedValue(user);
      await expectDenied(403);
    },
  );
  it("does not use unsafe metadata to replace missing trusted assignments", async () => {
    const user = makeUser();
    user.publicMetadata = { workspaceId: undefined, role: undefined };
    mocks.user.mockResolvedValue(user);
    await expectDenied(403);
  });
  it("rejects an unverified primary email", async () => {
    const user = makeUser();
    user.emailAddresses[0].verification.status = "unverified";
    mocks.user.mockResolvedValue(user);
    await expectDenied(403);
  });
  it("does not fall back to a secondary verified address", async () => {
    mocks.user.mockResolvedValue({ ...makeUser(), primaryEmailAddressId: "missing" });
    await expectDenied(403);
  });
});
