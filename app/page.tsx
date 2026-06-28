import { CloudOpsDashboard } from "@/app/cloudops-dashboard";
import { getCurrentMember } from "@/lib/auth";
import { getPlatformState } from "@/lib/repository";

export default async function Home() {
  const member = await getCurrentMember();
  const platformState = await getPlatformState(member);

  return <CloudOpsDashboard initialState={platformState} />;
}
