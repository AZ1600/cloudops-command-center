
# CloudOps Command Center

[![CI](https://github.com/AZ1600/cloudops-command-center/actions/workflows/ci.yml/badge.svg)](https://github.com/AZ1600/cloudops-command-center/actions/workflows/ci.yml)

**An evidence-driven cloud operations workspace for investigating infrastructure risks, routing decisions to service owners, and managing approval-gated remediation workflows.**

CloudOps Command Center brings together infrastructure signals, structured evidence, deterministic Decision Traces, ownership, runbooks, human approvals and auditable simulated execution.

Built using **Next.js, TypeScript, React, PostgreSQL, Clerk authentication and GitHub Actions**, the project demonstrates practical platform engineering, operational safety, workspace isolation and full-stack application development.

**Explore:** [Technical Review](#technical-review--start-here) · [Architecture](#architecture) · [Security](#authentication-and-authorization) · [Validation](#testing-and-validation) · [Screenshots](#project-screenshots) · [Limitations](#scope-and-limitations)

[Hosted Application](https://cloudops-command-center.vercel.app/) · [Authentication Guide](docs/authentication.md) · [Workspace Isolation](docs/workspace-isolation.md)

> [!IMPORTANT]
> This is a deployed portfolio application, not a production-certified remediation platform. The hosted workspace requires authenticated, explicitly assigned access. Infrastructure remediation is simulated. The current hosted authentication setup uses a Clerk development instance, and coordinated production database migration and operational hardening remain future work.

---

## Technical Review — Start Here

A quick guide for engineers and reviewers who want to examine the implementation rather than only the interface.

| Engineering Area | What to Review | Evidence |
| --- | --- | --- |
| System architecture | Signal ingestion, risk processing and operational decisions | [Architecture](#architecture) |
| Authentication | Verified identity and role-based API protection | [Authentication implementation](lib/auth.ts) |
| API authorization | Permission enforcement and protected endpoints | [API access controls](lib/api-auth.ts) |
| Workspace isolation | Tenant-scoped reads, writes and database transactions | [Workspace isolation tests](tests/integration/workspace-isolation.postgres.ts) |
| Approval safety | Preventing execution before authorization | [Approval-gate tests](tests/approval-gate.test.ts) |
| Decision Traces | Deterministic evidence-based operational reasoning | [Decision Trace implementation](lib/decision-trace.ts) |
| PlatformPilot integration | Validated findings with independent authentication | [Finding contract](contracts/operational-finding.schema.json) |
| Operational telemetry | Request IDs and structured event reporting | [Telemetry implementation](lib/telemetry.ts) |
| CI/CD | Automated tests, lint, typecheck, build and database verification | [GitHub Actions workflow](.github/workflows/ci.yml) |

### Validation at a Glance

| Check | Evidence |
| --- | --- |
| Automated application tests | **132 passing tests across 19 files**, reproduced locally on 30 October 2026 |
| Authentication regression tests | 77 passing tests across 3 files, included in the 132-test suite |
| PostgreSQL integration tests | 12 passing tests in the recorded 20 October validation |
| Next.js production build | Passed locally on 30 October 2026 |
| TypeScript validation | Passed locally on 30 October 2026 |
| ESLint command | Passed locally; TypeScript source coverage remains a documented gap |
| Operational-finding contract | Dedicated schema validation and automated tests |
| Workspace isolation | Recorded local PostgreSQL and hosted preview verification |

These results reflect the tests and environments described. They do not establish independent production certification.

---

## The Engineering Problem

Cloud and platform teams receive infrastructure signals from multiple systems:

- GitHub Actions workflows
- Kubernetes workloads
- Terraform plans
- Cloud infrastructure
- Monitoring and observability services
- Other internal engineering platforms

Detecting an issue is only the beginning.

Engineers must establish:

1. What happened and what evidence supports the finding?
2. Which service and environment are affected?
3. Who owns the affected service?
4. What risk does the issue present?
5. What verification should happen before remediation?
6. Who is authorized to approve an action?
7. How should the resulting decision be recorded?

CloudOps Command Center brings these concerns together in a structured investigation workflow.

## Core Operational Workflow

```text
Infrastructure Signal
         |
         v
Input Validation
         |
         v
Risk Detection and Classification
         |
         v
Raw Evidence and Service Ownership
         |
         v
Deterministic Decision Trace
         |
         v
Engineer Verification
         |
         v
Human Approval
         |
         v
Simulated Remediation
         |
         v
Audit and Execution History
```

The central principle is that **an infrastructure finding should not automatically become an infrastructure change**.

Recommendations and evidence are separated from authorization and execution.

---

## Architecture

CloudOps Command Center uses a Next.js and TypeScript application with server-side authorization, structured risk processing, workspace-scoped persistence and an interactive investigation dashboard.

```mermaid
flowchart TD
    GH[GitHub Actions]
    TF[Terraform Plans]
    PP[PlatformPilot]
    DEMO[Demonstration Signals]

    API[Ingestion APIs]
    VALIDATE[Authentication and Validation]
    RISK[Risk Classification]
    TRACE[Deterministic Decision Trace]
    DB[(Workspace State / PostgreSQL)]
    UI[Investigation Workspace]
    APPROVE{Human Approval?}
    EXEC[Simulated Execution]
    AUDIT[Audit History]

    GH --> API
    TF --> API
    PP --> API
    DEMO --> API

    API --> VALIDATE
    VALIDATE --> RISK
    RISK --> TRACE
    RISK --> DB
    TRACE --> DB
    DB --> UI

    UI --> APPROVE
    APPROVE -->|Rejected| DB
    APPROVE -->|Approved| EXEC
    EXEC --> AUDIT
    AUDIT --> DB
```

### Architectural Responsibilities

| Layer | Responsibility |
| --- | --- |
| Ingestion | Accept supported infrastructure signals and structured findings |
| Validation | Check request contracts, identity and integration credentials |
| Risk engine | Convert supported signals into classified operational risks |
| Decision Trace | Generate deterministic evidence-based reasoning steps |
| Service catalog | Associate risks with services and responsible owners |
| Authentication | Verify browser sessions, workspace assignments and roles |
| Repository | Manage isolated workspace state using memory or PostgreSQL |
| Investigation UI | Present findings, evidence, decisions and workflow status |
| Approval boundary | Prevent unauthorized changes to remediation status |
| Audit history | Record operational actions, approvals and simulated execution |

### Technology Stack

| Category | Technology |
| --- | --- |
| Frontend | Next.js, React, TypeScript |
| Backend | Next.js API routes |
| Authentication | Clerk |
| Database | PostgreSQL, with in-memory development storage |
| Validation | AJV and JSON Schema |
| Testing | Vitest |
| CI/CD | GitHub Actions |
| Hosting | Vercel |
| External integration | GitHub Actions API, Terraform plan JSON and PlatformPilot findings |

---

## Key Engineering Capabilities

### 1. Infrastructure Risk Detection

The platform converts supported infrastructure inputs into structured risks.

Each risk can include:

- Risk identifier
- Severity and status
- Source and environment
- Service ownership
- Evidence and contextual information
- Operational recommendations
- Approval requirements
- Audit and execution records

The dashboard supports filtering and investigation of operational findings.

### 2. Deterministic Decision Traces

A central feature is the five-step Decision Trace:

```text
Premise
   |
   v
Reasoning
   |
   v
Hypothesis
   |
   v
Verification
   |
   v
Conclusion
```

Decision Traces are structured application artifacts generated from supplied evidence and predefined logic.

Each step can contain:

- A stable identifier
- Explicit dependencies
- A bounded confidence value
- Evidence references
- Reasoning or verification context

The system separates observed evidence from proposed explanations.

**Decision Traces do not use an LLM or authorize infrastructure changes.**

[View implementation](lib/decision-trace.ts) · [View automated tests](tests/decision-trace.test.ts)

### 3. Human Approval and Simulated Execution

Infrastructure findings may require review before their execution status changes.

The workflow models:

```text
Risk Detected
      |
      v
Needs Approval
      |
      v
Authorized Review
      |
      +---- Rejected / Dismissed
      |
      v
Approved
      |
      v
Simulated Execution
      |
      v
Audit Record
```

Important controls include:

- Permission checks before protected operations
- An approval requirement before simulated execution
- Server-side enforcement
- Execution evidence and audit history
- Explicit separation between recommendations and actions

The system does not run Terraform apply, modify AWS resources or execute Kubernetes remediation commands.

[Approval-gate tests](tests/approval-gate.test.ts) · [Execution evidence tests](tests/execution-evidence.test.ts)

### 4. Service Ownership and Runbooks

Infrastructure risks are associated with service ownership information.

This helps engineers identify:

- The affected service
- Responsible owners
- Current operational state
- Outstanding risks
- Required verification
- Relevant remediation instructions

Runbooks document safety checks, operational procedures and rollback considerations.

[Service catalog tests](tests/service-catalog.test.ts) · [Runbook tests](tests/runbooks.test.ts)

### 5. PlatformPilot Integration

CloudOps Command Center can receive structured findings from PlatformPilot through a separately authenticated ingestion endpoint.

The integration uses:

- A documented JSON Schema contract
- Independent bearer-token authentication
- An explicitly configured target workspace
- Input validation before persistence
- Finding identification and deduplication
- A mandatory human approval boundary

PlatformPilot findings retain operational controls such as:

```text
approvalRequired: true
status: needs_approval
executionMode: manual
```

PlatformPilot's integration credential does not authorize browser-based risk approvals or execution.

[Operational-finding contract](contracts/operational-finding.schema.json) · [Contract tests](tests/operational-finding-contract.test.ts)

---

## Authentication and Authorization

CloudOps Command Center uses Clerk for browser authentication when configured.

Production browser access requires:

1. A valid authenticated session.
2. A verified primary email address.
3. An explicit trusted workspace assignment.
4. A recognized application role.
5. Server-side permission checks.

Creating an account does not automatically grant access to a workspace.

### Role-Based Access Control

| Role | Authorized capabilities |
| --- | --- |
| Viewer | Read assigned workspace information |
| Engineer | Read information and import supported engineering signals |
| Admin | Approve, dismiss and record simulated execution |
| Owner | Administrative operations and permitted demo reset |

These permissions are enforced on the server rather than relying solely on hidden interface controls.

### Authentication Failure Behaviour

| Condition | Expected response |
| --- | --- |
| Missing authenticated session | HTTP 401 |
| Invalid assignment or insufficient permission | HTTP 403 |
| Missing or unavailable authentication configuration | HTTP 503 |

Authentication error responses use `Cache-Control: no-store`.

Browser sessions and PlatformPilot ingestion tokens belong to separate trust boundaries.

[Authentication guide](docs/authentication.md) · [Authorization tests](tests/auth-route-boundaries.test.ts)

---

## Workspace Isolation and PostgreSQL

CloudOps Command Center supports isolated operational workspaces.

### In-Memory Mode

Development storage maintains separate workspace states.

- Workspace data is isolated by workspace ID.
- Reads return copies of state.
- Non-demo workspaces begin empty.
- Data is ephemeral and may be lost when the application restarts.

### PostgreSQL Mode

The PostgreSQL implementation provides:

- Workspace-scoped reads and writes
- Composite `(workspace_id, id)` record keys
- Independent service and finding records
- Transactional state changes
- Workspace-level locking
- Audit and execution record persistence
- Rollback of related changes when a transaction fails

Isolation is implemented by the application and database queries, **not PostgreSQL row-level security**.

### Cross-Workspace Validation

Recorded tests verify that workspaces cannot retrieve or modify each other's operational records through the tested application paths.

The hosted preview validation used two separately assigned test workspaces.

A finding created in Team A was not visible in Team B. Team B's approval attempt returned HTTP 404, and Team A's finding remained unchanged.

The production schema migration must be coordinated with application deployment; it is not automatically performed by the application.

[Workspace isolation documentation](docs/workspace-isolation.md) · [PostgreSQL integration tests](tests/integration/workspace-isolation.postgres.ts)

---

## Operational Telemetry and Auditability

CloudOps emits structured JSON telemetry for supported operational events.

Records include relevant fields such as:

- Timestamp
- Event name
- API route
- Request correlation ID
- Outcome and status code
- Actor role
- Risk or finding identifier
- Requested and current status
- Rejection or blocking reason

Supported incoming `x-request-id` values are preserved. Otherwise, the application generates an identifier.

Telemetry supports investigation and request correlation. Persistent audit events track business workflow decisions separately.

[Telemetry implementation](lib/telemetry.ts) · [Telemetry tests](tests/telemetry.test.ts)

---

## Testing and Validation

The project uses automated tests to verify application behaviour, security boundaries and integration contracts.

### Application Tests

Run:

```bash
npm run test
```

**Baseline verified locally on 30 October 2026:**

```text
Test Files  19 passed (19)
Tests       132 passed (132)
```

The suite covers areas including authentication, workspace access, approval gates, risk processing, telemetry, integration contracts and decision traces.

### Static and Build Validation

```bash
npm run lint
npm run typecheck
npm run build
npm run contracts:validate
git diff --check
```

The local lint, typecheck and production build commands passed on 30 October 2026, before the current improvement work.

**Known linting limitation:** The existing ESLint setup does not provide full TypeScript/TSX source coverage. Improving that configuration is a follow-up task.

### PostgreSQL Integration Tests

A separate PostgreSQL suite tests workspace isolation and transactional behaviour against a disposable database.

Start the test database:

```bash
docker compose -f compose.test.yml up -d --wait
```

Run the tests:

```bash
CLOUDOPS_TEST_DATABASE_URL='postgresql://cloudops_test:cloudops_local_test@127.0.0.1:55433/cloudops_test' npm run test:postgres
```

Recorded validation on 20 October 2026 included **12 passing PostgreSQL integration tests**.

After testing, stop the dedicated container:

```bash
docker compose -f compose.test.yml down
```

These tests are configured to use an isolated local test database, not a production database.

### CI/CD Pipeline

[GitHub Actions CI](.github/workflows/ci.yml) runs checks on pull requests and pushes to `main`.

The workflow includes:

- Locked dependency installation using `npm ci`
- ESLint
- TypeScript typechecking
- Vitest application tests
- Next.js production build
- PostgreSQL workspace-isolation integration tests
- Operational-finding contract validation
- Git whitespace verification

The CI workflow uses a PostgreSQL 17 service container for database integration testing.

### Verification Evidence

| Evidence | Reference |
| --- | --- |
| Application regression tests | [Test screenshot](docs/screenshots/workspace-isolation-tests.png) |
| PostgreSQL integration tests | [Database test screenshot](docs/screenshots/workspace-isolation-postgres.png) |
| Authentication regression tests | [Authentication test screenshot](docs/screenshots/auth-regression-tests.png) |
| Signed-out API rejection | [HTTP 401 screenshot](docs/screenshots/unauthenticated-api-401.png) |
| Viewer approval rejection | [HTTP 403 screenshot](docs/screenshots/viewer-approval-denied-403.png) |
| Cross-workspace denial | [Workspace separation screenshot](docs/screenshots/workspace-isolation-preview-denied.png) |

The hosted preview validation used demonstration data and a separate database branch. These checks demonstrate tested behaviours rather than broad production security certification.

---

## Local Development

### Requirements

- Node.js 22
- npm
- Optional PostgreSQL or Docker for persistent-storage testing
- Optional Clerk credentials for authenticated development

### Start the Application

```bash
git clone https://github.com/AZ1600/cloudops-command-center.git
cd cloudops-command-center

npm ci
npm run dev
```

Open:

```text
http://localhost:3000
```

When neither Clerk key is configured in local development, the application uses its demo identity.

When `DATABASE_URL` is absent, workspace data uses in-memory storage.

A partially configured Clerk environment does not enable the local demo fallback.

### Environment Configuration

Use `.env.example` as a configuration reference. Store secrets in an ignored local environment file or your deployment provider.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Public Clerk application key |
| `CLERK_SECRET_KEY` | Server-side Clerk authentication key |
| `DATABASE_URL` | PostgreSQL connection string |
| `DATABASE_SSL` | Database TLS configuration |
| `GITHUB_TOKEN` | Optional GitHub API authentication |
| `PLATFORM_PILOT_INGEST_TOKEN` | PlatformPilot integration credential |
| `PLATFORM_PILOT_WORKSPACE_ID` | Authorized target workspace for PlatformPilot findings |

Never commit private credentials, access tokens or database connection secrets.

### PostgreSQL Schema Setup

The current schema introduces composite workspace-scoped keys.

The earlier application version cannot safely write against the upgraded schema without the corresponding application changes.

Before a production migration:

1. Validate the updated application against a separate preview database.
2. Back up the existing database.
3. Coordinate the application and schema cutover.
4. Apply the migration using the intended environment.
5. Verify authentication, workspace isolation and operational workflows.

The schema command is:

```bash
npm run db:apply
```

**Do not run this command against an existing production database without reviewing the migration and backup plan.**

See [schema upgrade and deployment order](docs/workspace-isolation.md#schema-upgrade-and-deployment-order).

Additional workspaces can be provisioned using the operator-controlled command:

```bash
npm run workspace:create -- workspace-team-a 'Team A' team
```

New authenticated users are not automatically provisioned into workspaces.

---

## Project Screenshots

### Authenticated Investigation Dashboard

The dashboard presents infrastructure risks, ownership information, decision evidence and approval controls.

![Authenticated dashboard](docs/screenshots/authenticated-owner-dashboard.png)

### Project Architecture Overview

![CloudOps project overview](docs/Project-overview.png)

### Decision Trace Investigation

The investigation workspace separates raw observations, reasoning, verification and conclusions.

![Decision Trace investigation](docs/decision-trace-investigation.png)

### Approval and Execution Workflow

![Approval and execution flow](docs/screenshots/approval-execution-flow.png)

### Service Ownership

![Owner routing](docs/screenshots/owner-routing.png)

### Service Catalog

![Service catalog](docs/screenshots/service-catalog.png)

### Integration Status

Integration status distinguishes supported connections from demonstration or unconfigured sources.

![Integration status](docs/screenshots/integrations-status.png)

### Operational Runbooks

![Runbooks](docs/screenshots/runbooks.png)

---

## Implemented Integrations and Demo Boundaries

Not every displayed infrastructure source represents a live integration.

| Source or Capability | Current Implementation |
| --- | --- |
| GitHub Actions | Can import workflow-run data through the GitHub API |
| Terraform | Analyzes supplied plan JSON; does not execute Terraform |
| PlatformPilot | Accepts authenticated, contract-validated findings |
| AWS example signals | Demonstration data |
| Kubernetes example signals | Demonstration data |
| Monitoring example signals | Demonstration data |
| Decision Traces | Deterministic templates, not LLM-generated decisions |
| Remediation | Simulated execution and audit records |

Displayed confidence, risk and savings figures should not be interpreted as independently measured customer outcomes.

---

## Scope and Limitations

CloudOps Command Center demonstrates practical engineering patterns, but some capabilities intentionally remain within portfolio and development scope.

- **Execution:** Remediation is simulated. The application does not directly modify production cloud resources.
- **Persistence:** In-memory mode is temporary. PostgreSQL is available, but production schema cutover requires coordinated deployment.
- **Authentication:** Hosted access currently uses a Clerk development instance; further production identity hardening is required.
- **Workspace isolation:** Application-enforced isolation has been tested, but PostgreSQL row-level security is not used.
- **Integrations:** GitHub Actions and PlatformPilot have implemented integration paths. Other infrastructure signals may be seeded examples.
- **Observability:** Structured application telemetry is implemented, but a complete production monitoring and incident-response operation is not established.
- **Testing:** The current lint configuration does not fully cover TypeScript sources.
- **Commercial outcomes:** The project does not claim production customer adoption or measured financial savings.

## Future Engineering Improvements

Potential next steps include:

1. Expand ESLint coverage across TypeScript and React source files.
2. Strengthen production persistence and database transport configuration.
3. Improve deployment and schema-migration protections.
4. Add additional operational regression tests and failure scenarios.
5. Introduce production-grade execution integrations behind explicit authorization, idempotency and rollback controls.
6. Expand observability and operational readiness evidence.

These are possible future improvements, not claims of features already deployed.

---

## Repository Structure

```text
app/                  Next.js pages, components and API routes
lib/                  Authentication, risk engine, decision traces,
                      repository, integrations and telemetry
data/                 Demonstration signals, service catalog and runbooks
db/                   PostgreSQL persistence and schema support
contracts/            PlatformPilot operational finding schema
tests/                Automated unit and integration tests
docs/                 Architecture, operational evidence and guides
scripts/              Validation and workspace administration
.github/workflows/     GitHub Actions CI and demonstration workflow
```

## Engineering Skills Demonstrated

**Cloud and Platform Engineering**
- Infrastructure signal interpretation
- Service ownership and risk assessment
- Operational runbooks and auditability
- Approval-driven operational workflows

**Backend and Full-Stack Engineering**
- Next.js and TypeScript
- API validation and error handling
- PostgreSQL transactions and workspace isolation
- Server-side authentication and authorization

**DevOps and Security**
- GitHub Actions CI
- Automated regression testing
- Contract-driven integrations
- Role-based access boundaries
- Deployment configuration and operational evidence

**Engineering Governance**
- Deterministic decision artifacts
- Evidence-based investigation
- Human approval and execution separation
- Explicit operational limitations

---

## Author

**Olawale Azeez**

AWS Certified Developer – Associate
AWS Certified Solutions Architect – Associate
AWS Certified Cloud Practitioner

Cloud Engineer | Platform Engineer | DevOps Engineer

[GitHub](https://github.com/AZ1600) · [Portfolio](https://az1600.github.io/)
