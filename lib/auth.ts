import type { UserRole, WorkspaceMember } from "@/lib/types";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

const demoMember: WorkspaceMember = {
  id: "member-demo-owner",
  workspaceId: "workspace-demo",
  email: "owner@cloudops.example",
  name: "Demo Platform Owner",
  role: "owner",
};

export async function getCurrentMember(): Promise<WorkspaceMember> {
  if (!clerkEnabled) {
    return demoMember;
  }

  try {
    const { auth, currentUser } = await import("@clerk/nextjs/server");
    const session = await auth();
    const user = await currentUser();

    if (!session.userId || !user) {
      return demoMember;
    }

    const email = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)?.emailAddress ?? user.emailAddresses[0]?.emailAddress;

    return {
      id: session.userId,
      workspaceId: user.publicMetadata.workspaceId?.toString() ?? "workspace-demo",
      email: email ?? "unknown@cloudops.local",
      name: user.fullName ?? user.firstName ?? "CloudOps User",
      role: parseRole(user.publicMetadata.role),
    };
  } catch {
    return demoMember;
  }
}

function parseRole(value: unknown): UserRole {
  if (value === "owner" || value === "admin" || value === "engineer" || value === "viewer") {
    return value;
  }

  return "owner";
}
