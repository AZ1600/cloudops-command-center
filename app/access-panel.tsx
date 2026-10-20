import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/auth-config";
import { WorkspaceAccessError } from "@/lib/auth-errors";

export function AccessPanel({ error }: { error: WorkspaceAccessError }) {
  const title = error.status === 401 ? "Sign in to CloudOps"
    : error.status === 403 ? "Workspace access needs review"
    : "Sign-in is temporarily unavailable";
  return (
    <main style={{ maxWidth: 680, margin: "12vh auto", padding: 32 }}>
      <p className="eyebrow">CloudOps Command Center</p>
      <h1>{title}</h1>
      <p>{error.status === 403
        ? "Verify your primary email and contact your workspace administrator if you still cannot continue."
        : error.status === 503
          ? "We could not confirm your access. Please try again later."
          : "Sign in with the account assigned to your workspace."}</p>
      {error.status === 401 && <Link href="/login">Sign in</Link>}
      {error.status === 403 && isClerkConfigured() && (
        <SignOutButton redirectUrl="/login"><button type="button">Sign in with another account</button></SignOutButton>
      )}
    </main>
  );
}
