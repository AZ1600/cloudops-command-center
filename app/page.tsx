import { CloudOpsDashboard } from "@/app/cloudops-dashboard";
import { AccessPanel } from "@/app/access-panel";
import { getCurrentMember } from "@/lib/auth";
import { WorkspaceAccessError } from "@/lib/auth-errors";
import { getPlatformState } from "@/lib/repository";
import type { WorkspaceMember } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  let member: WorkspaceMember;
  try {
    member = await getCurrentMember();
  } catch (error) {
    if (!(error instanceof WorkspaceAccessError)) throw error;
    return <AccessPanel error={error} />;
  }
  const platformState = await getPlatformState(member);
  return <CloudOpsDashboard initialState={platformState} />;
}
