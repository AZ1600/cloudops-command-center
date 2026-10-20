# CloudOps authentication and evidence

## Access rules

Browser requests use a Clerk session in production. Both Clerk keys are required.
When neither key is set, the demo owner is available only in development/test.
A partial Clerk configuration never enables demo access.

The server reads the current Clerk user and requires:
- A user ID matching the authenticated session.
- A verified primary email.
- A valid `publicMetadata.workspaceId` for the intended existing workspace.
- An explicit `publicMetadata.role`: `viewer`, `engineer`, `admin`, or `owner`.

Clerk public metadata is backend-managed. Do not use unsafe metadata, browser
request fields, or email addresses to assign workspace access or promote a role.
There is no automatic owner promotion or workspace provisioning at sign-up.

| Operation | Minimum browser role |
| --- | --- |
| Read workspace | viewer |
| Import GitHub runs / Terraform plan | engineer |
| Approve, dismiss or simulate execution | admin |
| Reset the demo risk scan | owner |

Browser API failures return uncached JSON: 401 for no authenticated session,
403 for invalid assignments, unverified primary email or insufficient permission,
and 503 for missing/broken authentication configuration. SDK exception details are
not returned. Pages show an access panel before reading workspace data.

The existing application remains a portfolio workflow with simulated execution.
This change does not certify production readiness or repair the repository's
remaining workspace-isolation and persistence issues. Those need a separate PR
before supporting multiple customer workspaces.

## Configure Clerk before deploying this change

1. Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` for the same
   Clerk instance on your preview/deployment environment. Redeploy after setting
   the publishable key because it is included in the client build.
2. The embedded sign-in page is `/login`, with an optional catch-all route for
   Clerk verification and callback steps. Both completed sign-in and sign-up
   flows return to `/`.
3. In Clerk's user dashboard, assign backend-managed **public metadata** only
   to accounts you have authorized. For example:
   ```json
   { "workspaceId": "workspace-your-team", "role": "viewer" }
   ```
4. Use a workspace that already exists in PostgreSQL when PostgreSQL is enabled.
   This PR does not create or migrate workspaces. Use an isolated preview/test
   workspace for role checks; do not assign access to somebody else's workspace.
5. Verify the primary email using Clerk. An otherwise valid account with no
   assignment sees the access-review page instead of entering the demo workspace.

Official references:
- [Clerk sign-in route](https://clerk.com/docs/nextjs/guides/development/custom-sign-in-or-up-page)
- [Clerk metadata permissions](https://clerk.com/docs/guides/users/extending)

## PlatformPilot ingestion

`POST /api/platform-pilot/findings` uses its existing bearer token and does not
require or inherit a browser session.

Set:
- `PLATFORM_PILOT_INGEST_TOKEN`: the secret already shared with PlatformPilot.
- `PLATFORM_PILOT_WORKSPACE_ID`: the existing workspace assigned to that integration.

Only an unconfigured local demo may omit the workspace ID and use
`workspace-demo`. A configured Clerk environment or production requires the
explicit ID. Missing/invalid workspace configuration returns 503 after token
validation. The service identity is `integration-platform-pilot` with a viewer
role; it can use this ingestion endpoint, not approve or execute through the
browser APIs. Findings stay behind the existing human approval boundary.
The integration token is not a substitute for a browser session.

## Validate the branch

```bash
npm run test
npm run lint
npm run typecheck
npm run build
npm run contracts:validate
git diff --check
```

For the authentication evidence screenshot:
```bash
npm run test -- tests/auth-access.test.ts tests/auth-route-boundaries.test.ts tests/auth-pages.test.ts --reporter=verbose
```

Existing tests retain their local demo fixtures. Authentication regression tests
use mocked Clerk responses, no real Clerk credentials or cloud writes.
They verify identity checks, failures before repository access, role enforcement,
page access boundaries, and the separately scoped integration.

## Screenshots to add after verification

Save the following files under `docs/screenshots/` only after you have captured
the actual result. No placeholder screenshot images are included.

### 1. auth-regression-tests.png
Capture the targeted authentication test command above with readable case names
and the final passing counts. Include examples of missing session rejection,
unknown-role rejection and viewer approval rejection. Split into two images if
necessary rather than shrinking the output until it cannot be read.

### 2. unauthenticated-api-401.png
Use a preview deployment with **both Clerk keys configured**. Without passing
cookies or authorization headers, run:
```bash
curl -i 'https://YOUR-PREVIEW-HOST/api/platform-state'
```
Capture HTTP 401, the no-store header and the short JSON error.
An unconfigured production deployment returns 503; that proves configuration
rejection, not a successful Clerk-session check. An unconfigured local
development demo intentionally returns 200, so it is not the environment for
this screenshot.

### 3. viewer-approval-denied-403.png
Sign into the preview with an explicitly assigned, verified **viewer** account.
Use the browser developer console to confirm only the role:
```js
const stateResponse = await fetch("/api/platform-state");
const state = await stateResponse.json();
console.log({ status: stateResponse.status, role: state.currentMember?.role });
```
Proceed only when the output is status 200 and role viewer. Then make a request
for a fresh, nonexistent evidence-only risk ID:
```js
const result = await fetch("/api/risks/evidence-" + crypto.randomUUID(), {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "approved" })
});
console.log({ status: result.status, body: await result.json() });
```
Capture role viewer and status 403. Using a newly generated nonexistent ID avoids
changing a real risk even if you accidentally use a more privileged account.
Do not capture cookies, bearer tokens or authorization request headers.

### 4. authentication-ci-success.png
After pushing the PR, capture its GitHub Actions run with the branch/run title,
successful status and the test/typecheck/build steps visible.

Once the screenshots exist, add them and their captions in a small documentation
commit on this PR. Keep test-fixture/demonstration data clearly labelled and
hide personal emails from public screenshots.
