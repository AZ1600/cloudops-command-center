import { mockSignals } from "@/data/mock-signals";
import { CloudOpsDashboard } from "@/app/cloudops-dashboard";
import { analyzeSignals } from "@/lib/risk-engine";

export default function Home() {
  const risks = analyzeSignals(mockSignals);

  return <CloudOpsDashboard initialRisks={risks} />;
}
