"use client";

import { useMemo, useState } from "react";
import { integrations } from "@/data/integrations";
import { runbooks } from "@/data/runbooks";
import { sampleTerraformPlan } from "@/data/sample-terraform-plan";
import { serviceCatalog } from "@/data/service-catalog";
import { canApprove, canExecute } from "@/lib/permissions";
import { summarizeRisks } from "@/lib/risk-engine";
import type { DecisionTraceStepType, GitHubActionsSummary, InfrastructureRisk, IntegrationStatus, PlatformState, RiskStatus, ServiceHealth, SignalSource, TerraformPlanSummary } from "@/lib/types";

const sourceLabel = {
  github: "GitHub",
  aws: "AWS",
  kubernetes: "Kubernetes",
  terraform: "Terraform",
  monitoring: "Monitoring",
};

const severityLabel = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const statusLabel: Record<RiskStatus, string> = {
  open: "Open",
  needs_approval: "Needs Approval",
  approved: "Approved",
  executed: "Executed",
  dismissed: "Dismissed",
};

const integrationStatusLabel: Record<IntegrationStatus, string> = {
  connected: "Connected",
  mock: "Mock",
  not_connected: "Not connected",
};

const serviceHealthLabel: Record<ServiceHealth, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  critical: "Critical",
  watch: "Watch",
};

const traceStepLabel: Record<DecisionTraceStepType, string> = {
  premise: "Premise",
  reasoning: "Reasoning",
  hypothesis: "Hypothesis",
  verification: "Verification",
  conclusion: "Conclusion",
};

function getSignalConfidence(risk: InfrastructureRisk) {
  const severityWeight = risk.severity === "critical" ? 8 : risk.severity === "high" ? 5 : risk.severity === "medium" ? 3 : 1;
  return Math.min(98, 72 + risk.evidence.length * 5 + severityWeight);
}

type CloudOpsDashboardProps = {
  initialState: PlatformState;
};

type OwnerSummary = {
  owner: string;
  total: number;
  urgent: number;
  needsApproval: number;
  approved: number;
  executed: number;
  services: string[];
};

export function CloudOpsDashboard({ initialState }: CloudOpsDashboardProps) {
  const [platformState, setPlatformState] = useState(initialState);
  const [scanRunCount, setScanRunCount] = useState(1);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [terraformPlanJson, setTerraformPlanJson] = useState(sampleTerraformPlan);
  const [terraformPlanSummary, setTerraformPlanSummary] = useState<TerraformPlanSummary | null>(null);
  const [terraformImportError, setTerraformImportError] = useState<string | null>(null);
  const [githubRepository, setGithubRepository] = useState("AZ1600/cloudops-command-center");
  const [githubActionsSummary, setGithubActionsSummary] = useState<GitHubActionsSummary | null>(null);
  const [githubImportError, setGithubImportError] = useState<string | null>(null);
  const [selectedRiskId, setSelectedRiskId] = useState(initialState.risks[0]?.id ?? "");
  const [riskQuery, setRiskQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");

  const { auditEvents, currentMember, executionEvents, risks, workspace } = platformState;
  const summary = useMemo(() => summarizeRisks(risks), [risks]);
  const memberCanApprove = canApprove(currentMember.role);
  const memberCanExecute = canExecute(currentMember.role);
  const visibleRisks = risks.filter((risk) => risk.status !== "dismissed");
  const filteredRisks = visibleRisks.filter((risk) => {
    const query = riskQuery.trim().toLowerCase();
    const matchesQuery = !query || [risk.title, risk.service, risk.routedTo].some((value) => value.toLowerCase().includes(query));
    return matchesQuery && (severityFilter === "all" || risk.severity === severityFilter) && (sourceFilter === "all" || risk.source === sourceFilter);
  });
  const selectedRisk = risks.find((risk) => risk.id === selectedRiskId) ?? filteredRisks[0] ?? visibleRisks[0];
  const approvedRisks = risks.filter((risk) => risk.status === "approved" || risk.status === "executed");
  const activeServices = new Set(visibleRisks.map((risk) => risk.service));
  const risksByService = visibleRisks.reduce<Record<string, number>>((counts, risk) => ({ ...counts, [risk.service]: (counts[risk.service] ?? 0) + 1 }), {});
  const signalsBySource = visibleRisks.reduce<Record<SignalSource, number>>(
    (counts, risk) => ({
      ...counts,
      [risk.source]: counts[risk.source] + 1,
    }),
    {
      github: 0,
      aws: 0,
      kubernetes: 0,
      terraform: 0,
      monitoring: 0,
    },
  );
  const ownerSummaries = useMemo(() => {
    const summaries = new Map<string, OwnerSummary>();

    risks
      .filter((risk) => risk.status !== "dismissed")
      .forEach((risk) => {
        const current = summaries.get(risk.routedTo) ?? {
          owner: risk.routedTo,
          total: 0,
          urgent: 0,
          needsApproval: 0,
          approved: 0,
          executed: 0,
          services: [],
        };

        current.total += 1;
        current.urgent += risk.severity === "critical" || risk.severity === "high" ? 1 : 0;
        current.needsApproval += risk.status === "needs_approval" ? 1 : 0;
        current.approved += risk.status === "approved" || risk.status === "executed" ? 1 : 0;
        current.executed += risk.status === "executed" ? 1 : 0;
        current.services = Array.from(new Set([...current.services, risk.service]));
        summaries.set(risk.routedTo, current);
      });

    return Array.from(summaries.values()).sort((a, b) => b.urgent - a.urgent || b.total - a.total);
  }, [risks]);

  async function updateRiskStatus(risk: InfrastructureRisk, status: RiskStatus) {
    setPendingAction(`${risk.id}-${status}`);

    try {
      const response = await fetch(`/api/risks/${risk.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error("Unable to update risk");
      }

      setPlatformState((await response.json()) as PlatformState);
    } finally {
      setPendingAction(null);
    }
  }

  function dismissRisk(risk: InfrastructureRisk) {
    void updateRiskStatus(risk, "dismissed");
  }

  function approveRisk(risk: InfrastructureRisk) {
    void updateRiskStatus(risk, "approved");
  }

  function executeRisk(risk: InfrastructureRisk) {
    void updateRiskStatus(risk, "executed");
  }

  async function resetScan() {
    setPendingAction("scan");

    try {
      const response = await fetch("/api/risk-scan", { method: "POST" });

      if (!response.ok) {
        throw new Error("Unable to run risk scan");
      }

      setPlatformState((await response.json()) as PlatformState);
      setScanRunCount((current) => current + 1);
    } finally {
      setPendingAction(null);
    }
  }

  async function importTerraformPlan() {
    setPendingAction("terraform-import");
    setTerraformImportError(null);

    try {
      const response = await fetch("/api/terraform-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planJson: terraformPlanJson }),
      });

      if (!response.ok) {
        throw new Error("Terraform plan JSON could not be imported");
      }

      const nextState = (await response.json()) as PlatformState & { terraformPlanSummary?: TerraformPlanSummary };
      setPlatformState(nextState);
      setTerraformPlanSummary(nextState.terraformPlanSummary ?? null);
    } catch {
      setTerraformImportError("Paste valid Terraform plan JSON from terraform show -json.");
    } finally {
      setPendingAction(null);
    }
  }

  async function fetchGithubActions() {
    setPendingAction("github-actions");
    setGithubImportError(null);

    try {
      const response = await fetch("/api/github-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository: githubRepository }),
      });

      if (!response.ok) {
        throw new Error("GitHub Actions runs could not be fetched");
      }

      const nextState = (await response.json()) as PlatformState & { githubActionsSummary?: GitHubActionsSummary };
      setPlatformState(nextState);
      setGithubActionsSummary(nextState.githubActionsSummary ?? null);
    } catch {
      setGithubImportError("Use owner/repo format and confirm GitHub Actions is visible to this app.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar" aria-label="CloudOps navigation">
        <div className="brand-mark">CC</div>
        <div>
          <p className="eyebrow">CloudOps</p>
          <h1>Command Center</h1>
          <span className="role-chip">{currentMember.role}</span>
        </div>
        <nav>
          {["Risk Inbox", "Approvals", "Owners", "Integrations", "Runbooks", "Audit Log"].map((item, index) => (
            <a className={index === 0 ? "active" : ""} href={`#${item.toLowerCase().replaceAll(" ", "-")}`} key={item}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {item}
            </a>
          ))}
        </nav>
        <section className="signal-list">
          <p className="eyebrow">Signal Sources</p>
          <span>GitHub Actions</span>
          <span>AWS</span>
          <span>Kubernetes</span>
          <span>Terraform</span>
          <span>Monitoring</span>
        </section>
      </aside>

      <section className="workspace">
        <header className="hero">
          <div>
            <p className="eyebrow">AI Platform Engineer</p>
            <h2>Infrastructure risks routed to owners before execution.</h2>
            <p>
              Detect reliability, security, cost, and deployment risks. Explain impact, recommend safe fixes, and require approval before any change runs.
            </p>
          </div>
          <div className="hero-actions">
            <button disabled={pendingAction === "scan"} onClick={resetScan}>
              {pendingAction === "scan" ? "Scanning" : "Run risk scan"}
            </button>
            <button className="secondary">Export audit</button>
          </div>
        </header>

        <section className="scan-status" aria-live="polite">
          <div>
            <strong>Scan complete</strong>
            <span>
              Run #{scanRunCount} found {risks.length} infrastructure risks across {Object.keys(signalsBySource).length} signal sources for {workspace.name}.
            </span>
          </div>
          <span>{summary.needsApproval} waiting for approval</span>
        </section>

        <section className="metrics" aria-label="Risk summary">
          <article>
            <span>Active risks</span>
            <strong>{summary.total}</strong>
            <small>{summary.dismissed} dismissed from review</small>
          </article>
          <article>
            <span>Critical</span>
            <strong>{summary.critical}</strong>
            <small>Security or production exposure</small>
          </article>
          <article>
            <span>Need approval</span>
            <strong>{summary.needsApproval}</strong>
            <small>{summary.executed} executed safely</small>
          </article>
          <article>
            <span>Monthly savings</span>
            <strong>${summary.estimatedMonthlySavings}</strong>
            <small>Estimated avoidable spend</small>
          </article>
        </section>

        <section className="investigation-layout" id="risk-inbox">
          <div className="panel risk-inbox-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Risk Inbox</p>
                <h3>Investigation queue</h3>
              </div>
              <span>{summary.needsApproval} need approval</span>
            </div>
            <div className="risk-filters">
              <input aria-label="Search risks" onChange={(event) => setRiskQuery(event.target.value)} placeholder="Search risk, service, or owner" value={riskQuery} />
              <select aria-label="Filter by severity" onChange={(event) => setSeverityFilter(event.target.value)} value={severityFilter}>
                <option value="all">All severities</option>
                {Object.entries(severityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <select aria-label="Filter by source" onChange={(event) => setSourceFilter(event.target.value)} value={sourceFilter}>
                <option value="all">All sources</option>
                {Object.entries(sourceLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="risk-queue">
              {filteredRisks.map((risk) => (
                <button
                  aria-pressed={selectedRisk?.id === risk.id}
                  className={`risk-queue-item ${selectedRisk?.id === risk.id ? "selected" : ""}`}
                  key={risk.id}
                  onClick={() => setSelectedRiskId(risk.id)}
                >
                  <span className={`severity ${risk.severity}`}>{severityLabel[risk.severity]}</span>
                  <strong>{risk.title}</strong>
                  <small>{risk.service} · {risk.routedTo}</small>
                  <span className="queue-meta">{sourceLabel[risk.source]} · {getSignalConfidence(risk)}% confidence</span>
                </button>
              ))}
              {filteredRisks.length === 0 ? <p className="empty-state">No risks match these filters.</p> : null}
            </div>
          </div>

          {selectedRisk ? (
            <article className="panel decision-inspector" aria-live="polite">
              <div className="inspector-header">
                <div>
                  <p className="eyebrow">Decision Trace</p>
                  <h3>{selectedRisk.title}</h3>
                  <p>{selectedRisk.detail}</p>
                </div>
                <div className="inspector-badges">
                  <span className={`severity ${selectedRisk.severity}`}>{severityLabel[selectedRisk.severity]}</span>
                  <span className={`status ${selectedRisk.status}`}>{statusLabel[selectedRisk.status]}</span>
                  <span className="owner">{selectedRisk.routedTo}</span>
                </div>
              </div>

              <div className="inspector-summary">
                <div><span>Service</span><strong>{selectedRisk.service}</strong></div>
                <div><span>Signal</span><strong>{sourceLabel[selectedRisk.source]}</strong></div>
                <div><span>Confidence</span><strong>{getSignalConfidence(selectedRisk)}%</strong></div>
                <div><span>Execution</span><strong>{selectedRisk.recommendation.executionMode.replace("_", " ")}</strong></div>
              </div>

              <div className="evidence-view inspector-evidence">
                <div><strong>Raw evidence</strong><span>Preserved from source</span></div>
                <ul>{selectedRisk.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>

              {selectedRisk.decisionTrace ? (
                <div className="trace-flow">
                  {selectedRisk.decisionTrace.steps.map((step, index) => (
                    <article className={`trace-step ${step.type}`} key={step.id}>
                      <div className="trace-rail"><span>{index + 1}</span></div>
                      <div className="trace-content">
                        <header>
                          <strong>{traceStepLabel[step.type]}</strong>
                          <span>{Math.round(step.confidence * 100)}% confidence</span>
                        </header>
                        <p>{step.content}</p>
                        <small>{step.dependencies.length ? `Depends on ${step.dependencies.map((id) => id.split("-").at(-1)).join(", ")}` : "Source observation"}</small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : <p className="empty-state">This risk predates Decision Trace generation. Re-import the source finding to generate a trace.</p>}

              <div className="approval-boundary">
                <div>
                  <span>Human approval boundary</span>
                  <strong>No infrastructure change runs from this trace.</strong>
                  <p>{selectedRisk.recommendation.summary}</p>
                </div>
                <div className="approval-actions">
                  <button className="secondary" disabled={selectedRisk.status !== "needs_approval" || !memberCanApprove || pendingAction === `${selectedRisk.id}-dismissed`} onClick={() => dismissRisk(selectedRisk)}>Dismiss</button>
                  <button disabled={selectedRisk.status !== "needs_approval" || !memberCanApprove || pendingAction === `${selectedRisk.id}-approved`} onClick={() => approveRisk(selectedRisk)}>{pendingAction === `${selectedRisk.id}-approved` ? "Approving" : "Approve for review"}</button>
                </div>
              </div>
            </article>
          ) : null}
        </section>

        <section className="split operations-layout">
          <div className="side-stack">
            <div className="panel" id="owners">
              <p className="eyebrow">Owners</p>
              <h3>Routing map</h3>
              <div className="owner-list">
                {ownerSummaries.map((owner) => (
                  <article key={owner.owner}>
                    <div>
                      <strong>{owner.owner}</strong>
                      <span>{owner.services.join(", ")}</span>
                    </div>
                    <dl>
                      <div>
                        <dt>Risks</dt>
                        <dd>{owner.total}</dd>
                      </div>
                      <div>
                        <dt>Urgent</dt>
                        <dd>{owner.urgent}</dd>
                      </div>
                      <div>
                        <dt>Waiting</dt>
                        <dd>{owner.needsApproval}</dd>
                      </div>
                      <div>
                        <dt>Done</dt>
                        <dd>{owner.executed}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            </div>

            <div className="panel" id="approvals">
              <p className="eyebrow">Approval Queue</p>
              <h3>Safe execution gate</h3>
              <div className="approval-list">
                {approvedRisks.length === 0 ? (
                  <p className="empty-state">Approved remediations will appear here before execution.</p>
                ) : (
                  approvedRisks.map((risk) => (
                    <article key={risk.id}>
                      <strong>{risk.title}</strong>
                      <span>{risk.routedTo}</span>
                      <code>{risk.recommendation.executionMode.replace("_", " ")}</code>
                      <button disabled={risk.status === "executed" || !memberCanExecute || pendingAction === `${risk.id}-executed`} onClick={() => executeRisk(risk)}>
                        {pendingAction === `${risk.id}-executed` ? "Executing" : risk.status === "executed" ? "Executed" : "Execute remediation"}
                      </button>
                    </article>
                  ))
                )}
              </div>
            </div>

            <div className="panel" id="execution">
              <p className="eyebrow">Execution Log</p>
              <h3>Approved changes</h3>
              <div className="execution-list">
                {executionEvents.length === 0 ? (
                  <p className="empty-state">Executed remediations will appear here with safety checks and command evidence.</p>
                ) : (
                  executionEvents.map((event) => (
                    <article key={event.id}>
                      <span>{event.createdAt}</span>
                      <strong>{event.title}</strong>
                      <p>{event.owner} handled this {event.mode.replace("_", " ")} remediation.</p>
                      {event.commandPreview ? <code>{event.commandPreview}</code> : null}
                      <ol>
                        {event.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    </article>
                  ))
                )}
              </div>
            </div>

            <div className="panel" id="audit-log">
              <p className="eyebrow">Audit Log</p>
              <h3>Decision history</h3>
              <div className="audit-list">
                {auditEvents.map((event) => (
                  <article key={event.id}>
                    <span>{event.createdAt}</span>
                    <strong>{event.riskTitle}</strong>
                    <p>{event.detail}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="panel services-panel" id="service-catalog">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Service Catalog</p>
              <h3>Owned platform assets</h3>
            </div>
            <span>{serviceCatalog.length} services tracked</span>
          </div>
          <div className="service-grid">
            {serviceCatalog.map((service) => (
              <article className="service-card" key={service.id}>
                <div className="risk-topline">
                  <div>
                    <span className={`service-health ${service.health}`}>{serviceHealthLabel[service.health]}</span>
                    <span className="source">{service.environment}</span>
                  </div>
                  <span className="owner">{risksByService[service.id] ?? 0} active risks</span>
                </div>
                <h4>{service.name}</h4>
                <dl>
                  <div>
                    <dt>Owner</dt>
                    <dd>{service.owner}</dd>
                  </div>
                  <div>
                    <dt>Runtime</dt>
                    <dd>{service.runtime}</dd>
                  </div>
                  <div>
                    <dt>Last change</dt>
                    <dd>{service.lastChange}</dd>
                  </div>
                </dl>
                <div className="service-integrations">
                  {service.integrations.map((integration) => (
                    <span key={integration}>{sourceLabel[integration]}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel integrations-panel" id="integrations">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Integrations</p>
              <h3>Infrastructure signal sources</h3>
            </div>
            <span>{integrations.filter((integration) => integration.status !== "not_connected").length} active sources</span>
          </div>
          <div className="integration-grid">
            {integrations.map((integration) => (
              <article className="integration-card" key={integration.id}>
                <div className="risk-topline">
                  <div>
                    <span className={`connector-status ${integration.status}`}>{integrationStatusLabel[integration.status]}</span>
                    <span className="source">{signalsBySource[integration.id]} signals</span>
                  </div>
                  <span className="owner">{integration.lastSync}</span>
                </div>
                <h4>{integration.name}</h4>
                <ul>
                  {integration.provides.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p>{integration.nextStep}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel github-panel" id="github-actions">
          <div className="section-heading">
            <div>
              <p className="eyebrow">GitHub Actions</p>
              <h3>Live workflow failure detection</h3>
            </div>
            <span>{githubActionsSummary ? `${githubActionsSummary.generatedRisks} risks imported` : "Fetch workflow runs"}</span>
          </div>
          <div className="github-import">
            <div>
              <label htmlFor="github-repository">Repository</label>
              <input
                id="github-repository"
                onChange={(event) => setGithubRepository(event.target.value)}
                placeholder="owner/repository"
                value={githubRepository}
              />
              {githubImportError ? <p className="form-error">{githubImportError}</p> : null}
            </div>
            <aside>
              <strong>Detection path</strong>
              <p>CloudOps reads recent workflow runs, turns failed deployments into risks, and routes them to the platform owner approval queue.</p>
              {githubActionsSummary ? (
                <dl>
                  <div>
                    <dt>Total runs</dt>
                    <dd>{githubActionsSummary.totalRuns}</dd>
                  </div>
                  <div>
                    <dt>Failed runs</dt>
                    <dd>{githubActionsSummary.failedRuns}</dd>
                  </div>
                  <div>
                    <dt>Generated risks</dt>
                    <dd>{githubActionsSummary.generatedRisks}</dd>
                  </div>
                </dl>
              ) : null}
              <button disabled={pendingAction === "github-actions"} onClick={fetchGithubActions}>
                {pendingAction === "github-actions" ? "Fetching runs" : "Fetch GitHub Actions"}
              </button>
            </aside>
          </div>
        </section>

        <section className="panel terraform-panel" id="terraform-import">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Terraform Import</p>
              <h3>Plan JSON risk detection</h3>
            </div>
            <span>{terraformPlanSummary ? `${terraformPlanSummary.generatedRisks} risks imported` : "Paste plan JSON"}</span>
          </div>
          <div className="terraform-import">
            <div>
              <textarea
                aria-label="Terraform plan JSON"
                onChange={(event) => setTerraformPlanJson(event.target.value)}
                spellCheck={false}
                value={terraformPlanJson}
              />
              {terraformImportError ? <p className="form-error">{terraformImportError}</p> : null}
            </div>
            <aside>
              <strong>Accepted input</strong>
              <p>Paste output from <code>terraform show -json plan.out</code>. CloudOps detects risky changes and routes them into approvals.</p>
              {terraformPlanSummary ? (
                <dl>
                  <div>
                    <dt>Total changes</dt>
                    <dd>{terraformPlanSummary.totalChanges}</dd>
                  </div>
                  <div>
                    <dt>Risky changes</dt>
                    <dd>{terraformPlanSummary.riskyChanges}</dd>
                  </div>
                  <div>
                    <dt>Generated risks</dt>
                    <dd>{terraformPlanSummary.generatedRisks}</dd>
                  </div>
                </dl>
              ) : null}
              <button disabled={pendingAction === "terraform-import"} onClick={importTerraformPlan}>
                {pendingAction === "terraform-import" ? "Importing plan" : "Import Terraform plan"}
              </button>
            </aside>
          </div>
        </section>

        <section className="panel runbooks-panel" id="runbooks">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Runbooks</p>
              <h3>Controlled remediation procedures</h3>
            </div>
            <span>{runbooks.length} active procedures</span>
          </div>
          <div className="runbook-grid">
            {runbooks.map((runbook) => (
              <article className="runbook-card" key={runbook.id}>
                <div className="risk-topline">
                  <div>
                    <span className="source">{runbook.category}</span>
                    <span className="status approved">{runbook.executionMode.replace("_", " ")}</span>
                  </div>
                  <span className="owner">{runbook.owner}</span>
                </div>
                <h4>{runbook.title}</h4>
                <p>
                  Applies to {runbook.appliesTo.join(", ")}
                  {runbook.appliesTo.some((service) => activeServices.has(service)) ? " and is currently linked to an active risk." : "."}
                </p>
                <div className="runbook-columns">
                  <div>
                    <strong>Safety checks</strong>
                    <ol>
                      {runbook.safetyChecks.map((check) => (
                        <li key={check}>{check}</li>
                      ))}
                    </ol>
                  </div>
                  <div>
                    <strong>Rollback plan</strong>
                    <ol>
                      {runbook.rollbackPlan.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
