import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { AccessPanel } from "@/app/access-panel";
import { getCurrentMember } from "@/lib/auth";
import { WorkspaceAccessError } from "@/lib/auth-errors";
import { isLocalDemoAllowed } from "@/lib/auth-config";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (isLocalDemoAllowed()) redirect("/");
  try {
    await getCurrentMember();
  } catch (error) {
    if (!(error instanceof WorkspaceAccessError)) throw error;
    if (error.status !== 401) return <AccessPanel error={error} />;
    return (
      <main style={{ maxWidth: 680, margin: "8vh auto", padding: 32 }}>
        <p className="eyebrow">CloudOps Command Center</p>
        <h1>Sign in to your workspace</h1>
        <SignIn
          routing="path"
          path="/login"
          withSignUp
          forceRedirectUrl="/"
          signUpForceRedirectUrl="/"
        />
      </main>
    );
  }
  redirect("/");
}
