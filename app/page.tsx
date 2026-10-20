import { CloudOpsDashboard } from "@/app/cloudops-dashboard";
import { AccessPanel } from "@/app/access-panel";
import { getCurrentMember } from "@/lib/auth";
import { WorkspaceAccessError } from "@/lib/auth-errors";
import { getPlatformState } from "@/lib/repository";
import type { PlatformState } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  let platformState: PlatformState;
  try {
    const member = await getCurrentMember();
    platformState = await getPlatformState(member);
  } catch (error) {
    if (!(error instanceof WorkspaceAccessError)) throw error;
    return <AccessPanel error={error} />;
  }
  return <CloudOpsDashboard initialState={platformState} />;
}
