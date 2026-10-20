import { isClerkConfigured, isLocalDemoAllowed, isWorkspaceId } from "@/lib/auth-config";
import { WorkspaceAccessError } from "@/lib/auth-errors";
import { demoMember } from "@/lib/platform-state";
import type { UserRole, WorkspaceMember } from "@/lib/types";

function parseRole(value: unknown): UserRole {
  if (value === "owner" || value === "admin" || value === "engineer" || value === "viewer") {
    return value;
  }
  throw new WorkspaceAccessError(403, "Workspace access needs review.");
}

export async function getCurrentMember(): Promise<WorkspaceMember> {
  if (isLocalDemoAllowed()) return { ...demoMember };
  if (!isClerkConfigured()) {
    throw new WorkspaceAccessError(503, "Authentication is temporarily unavailable.");
  }

  try {
    const { auth, currentUser } = await import("@clerk/nextjs/server");
    const session = await auth();
    if (!session.userId) {
      throw new WorkspaceAccessError(401, "Sign in to access your workspace.");
    }

    const user = await currentUser();
    if (!user || user.id !== session.userId) {
      throw new WorkspaceAccessError(401, "Sign in to access your workspace.");
    }

    const workspaceId = user.publicMetadata.workspaceId;
    if (!isWorkspaceId(workspaceId)) {
      throw new WorkspaceAccessError(403, "Workspace access needs review.");
    }
    const role = parseRole(user.publicMetadata.role);
    const email = user.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId,
    );
    if (!email?.emailAddress || email.verification?.status !== "verified") {
      throw new WorkspaceAccessError(403, "Verify your primary email before continuing.");
    }

    return {
      id: session.userId,
      workspaceId,
      email: email.emailAddress,
      name: user.fullName?.trim() || user.firstName?.trim() || email.emailAddress,
      role,
    };
  } catch (error) {
    if (error instanceof WorkspaceAccessError) throw error;
    throw new WorkspaceAccessError(503, "Authentication is temporarily unavailable.");
  }
}
