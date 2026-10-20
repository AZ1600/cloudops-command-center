# Workspace storage isolation

CloudOps uses the authenticated member's workspace ID for browser requests and the
server-configured target workspace for PlatformPilot ingestion. A workspace ID or
role supplied in a browser request body cannot change that assignment.

## Storage behavior

- In memory, each workspace has an independent state and operation queue. Reads
  return deep copies; modifying an imported record or returned object cannot
  change stored data. Only `workspace-demo` receives seeded demonstration risks.
  Other trusted assignments start empty with a temporary workspace label.
- In Postgres, workspace metadata comes from the matching `workspaces` row.
  Non-demo workspaces must be provisioned explicitly. Unknown workspaces return
  403 without creating a workspace or member record.
- Members, risks, audits and execution events use `(workspace_id, id)` primary
  keys. Identical source IDs in two workspaces remain independent. All risk,
  audit and execution reads and writes include the workspace ID.
- Operations use a single database client and transaction with a workspace row
  lock. A failed audit/execution write rolls back its accompanying status update.
- Re-imports refresh finding evidence while preserving decisions in that workspace.
- Reset is restricted to the owner of `workspace-demo`; it cannot replace a real
  workspace with seeded examples. Audit and execution history are retained.
- Demo bootstrap does not rename existing workspace rows, and reads do not seed
  the demo again merely because its risk list has become empty.

This is application-enforced isolation, not PostgreSQL row-level security. A user
with database credentials still has the privileges granted to that database role.
Execution remains simulated, and in-memory storage remains ephemeral.

## Schema upgrade and deployment order

`npm run db:apply` now upgrades the original single-column primary keys to composite
workspace keys in one transaction. It preserves existing rows and can be applied
again. It deliberately stops rather than cascading through unexpected constraints.
The original schema is retained as a fixture for the automated upgrade test.

The old application uses `ON CONFLICT (id)` and cannot write against the new keys.
The new application requires the upgraded schema, including `demo_seeded_at`.
Treat this as a coordinated application/schema cutover:

1. Test the PR against a separate preview database. Do not migrate a production
   database shared by the old deployment just to test the preview.
2. Back up the production database and confirm there are no other writers using
   the original schema. Pause writes while performing the cutover.
3. Apply `npm run db:apply` with the intended database URL and SSL settings, then
   deploy this application version before reopening access.
4. Verify owner/viewer sign-in, workspace reads and approved simulated execution.
   If the migration fails, its transaction rolls back. After a successful upgrade,
   reverting only the application code is not a compatible rollback; use a tested
   database restore/application rollback plan if required.

No production migration is run by the file installer or the integration tests.
The existing SSL configuration is unchanged and needs a separate hardening pass.

## Provision a workspace

Use an operator-controlled environment with the intended `DATABASE_URL` set:

```bash
npm run workspace:create -- workspace-team-a 'Team A' team
```

The command creates a workspace without demo findings and does not replace details
if its ID already exists. Assign authorized Clerk users `workspaceId` and `role`
through backend-managed public metadata after provisioning the workspace. Do not
put database credentials or Clerk secrets in Git or screenshots.

## Verification

```bash
npm run test
npm run typecheck
npm run build
npm run contracts:validate
git diff --check

docker compose -f compose.test.yml up -d --wait
CLOUDOPS_TEST_DATABASE_URL='postgresql://cloudops_test:cloudops_local_test@127.0.0.1:55433/cloudops_test' npm run test:postgres
```

The Postgres suite requires an explicitly supplied local URL and a database named
`cloudops_test`. It creates uniquely named test schemas, removes them afterwards,
and never defaults to the application's database URL. The Compose database has
separate credentials, localhost-only access and temporary container storage.
`docker compose -f compose.test.yml down` removes this test container and its
network; it does not affect unrelated containers.

Tests cover duplicate finding IDs across workspaces, imports, foreign-record
updates, approval and execution evidence, member and event IDs, independent
workspace metadata, snapshots, concurrent operations, reset restrictions,
transaction rollback, and preserving legacy data on repeated schema upgrades.
GitHub Actions runs the separate PostgreSQL suite using its own service database.

For a readable evidence screenshot:

```bash
npm run test -- tests/workspace-isolation.test.ts tests/workspace-api.test.ts --reporter=verbose --silent
npm run test:postgres -- --reporter=verbose
```

Save the actual outputs as `docs/screenshots/workspace-isolation-tests.png` and
`docs/screenshots/workspace-isolation-postgres.png`. For browser evidence, use two
separately provisioned preview workspaces and capture a 404 when one tries to
approve a risk that exists only in the other. Avoid real customer data and never
show credentials, cookies, or bearer tokens. No placeholder screenshots are added.
