"use client";

import { useMemo, useState } from "react";
import { integrations } from "@/data/integrations";
import { runbooks } from "@/data/runbooks";
import { serviceCatalog } from "@/data/service-catalog";
import { canApprove, canExecute } from "@/lib/permissions";
import { summarizeRisks } from "@/lib/risk-engine";
import type { InfrastructureRisk, IntegrationStatus, PlatformState, RiskStatus, ServiceHealth, SignalSource } from "@/lib/types";

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

  const { auditEvents, currentMember, executionEvents, risks, workspace } = platformState;
  const summary = useMemo(() => summarizeRisks(risks), [risks]);
  const memberCanApprove = canApprove(currentMember.role);
  const memberCanExecute = canExecute(currentMember.role);
  const visibleRisks = risks.filter((risk) => risk.status !== "dismissed");
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

        <section className="split">
          <div className="panel wide" id="risk-inbox">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Risk Inbox</p>
                <h3>AI-detected infrastructure risks</h3>
              </div>
              <span>{summary.needsApproval} need approval</span>
            </div>
            <div className="risk-stack">
              {visibleRisks.map((risk) => (
                <article className={`risk-card ${risk.status}`} key={risk.id}>
                  <div className="risk-topline">
                    <div>
                      <span className={`severity ${risk.severity}`}>{severityLabel[risk.severity]}</span>
                      <span className="source">{sourceLabel[risk.source]}</span>
                      <span className={`status ${risk.status}`}>{statusLabel[risk.status]}</span>
                    </div>
                    <span className="owner">Route: {risk.routedTo}</span>
                  </div>
                  <h4>{risk.title}</h4>
                  <p>{risk.detail}</p>
                  <div className="explain">
                    <strong>Impact</strong>
                    <span>{risk.impact}</span>
                  </div>
                  <div className="evidence-view">
                    <div>
                      <strong>Evidence</strong>
                      <span>{getSignalConfidence(risk)}% confidence</span>
                    </div>
                    <ul>
                      {risk.evidence.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="remediation">
                    <strong>{risk.recommendation.summary}</strong>
                    <ol>
                      {risk.recommendation.steps.slice(0, 3).map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>
                  <div className="risk-footer">
                    <code>{risk.recommendation.commandPreview}</code>
                    <div>
                      <button
                        className="secondary"
                        disabled={risk.status !== "needs_approval" || !memberCanApprove || pendingAction === `${risk.id}-dismissed`}
                        onClick={() => dismissRisk(risk)}
                      >
                        {pendingAction === `${risk.id}-dismissed` ? "Dismissing" : "Dismiss"}
                      </button>
                      <button disabled={risk.status !== "needs_approval" || !memberCanApprove || pendingAction === `${risk.id}-approved`} onClick={() => approveRisk(risk)}>
                        {pendingAction === `${risk.id}-approved` ? "Approving" : risk.status === "approved" ? "Approved" : "Approve"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

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
