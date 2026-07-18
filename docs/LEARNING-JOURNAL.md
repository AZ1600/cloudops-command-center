# CloudOps Command Center Learning Journal

This journal records the commands, decisions, errors, fixes, and lessons learned while improving CloudOps Command Center.

## Session 1 — Baseline and dependency investigation

**Date:** 18 July 2026
**Branch:** `codex/external-findings-v1`

### Goal

Confirm that the original application is healthy before changing its code.

### Clone the repository

```bash
git clone https://github.com/AZ1600/cloudops-command-center.git
```

This downloaded the repository and created a local Git working copy.

### Check the current branch and file status

```bash
git status -sb
```

Important output:

```text
## codex/external-findings-v1
```

The `-s` option displays short status.
The `-b` option includes the current branch.

### Install exact locked dependencies

```bash
npm ci
```

Result:

- 412 packages installed.
- 413 packages audited.
- Three moderate vulnerabilities reported.

`npm ci` performs a clean and reproducible installation using `package-lock.json`.

### Investigate dependency vulnerabilities

```bash
npm audit
```

The audit identified a moderate PostCSS vulnerability through this dependency chain:

```text
@clerk/nextjs
└── next
    └── postcss@8.4.31
```

The project did not apply `npm audit fix` automatically because an automatic dependency upgrade could introduce breaking changes.

### Inspect the dependency tree

```bash
npm ls postcss next @clerk/nextjs
```

Result:

- `@clerk/nextjs@7.5.9`
- `next@16.2.9`
- Next.js uses `postcss@8.4.31`
- Vite uses the patched `postcss@8.5.15`

### Search for possible exposure

The preferred command was:

```bash
rg -n '"name": "opspilot-saas"' package-lock.json
```

It failed because ripgrep was not installed:

```text
zsh: command not found: rg
```

The fallback command was:

```bash
grep -n '"name": "opspilot-saas"' package-lock.json
```

Lesson: when `rg` is unavailable, `grep` can perform the search.

The application was also searched for user-controlled CSS or unsafe HTML:

```bash
grep -RInE 'dangerouslySetInnerHTML|postcss|<style' app lib
```

No output meant no matching source code was found.

### Security decision

The PostCSS advisory remains a temporary accepted dependency risk because:

- npm reported no compatible stable automatic fix.
- No matching exposure was found in application code.
- Forcing a canary or incompatible upgrade could destabilize the application.
- The dependency will be monitored for a stable upstream fix.

### Run the baseline tests

```bash
npm run test
```

Result:

```text
Test Files  6 passed
Tests       17 passed
```

### Run linting

```bash
npm run lint
```

No output after ESLint started meant linting passed.

### Run TypeScript checking

```bash
npm run typecheck
```

The command completed without errors.

`tsc --noEmit` checks TypeScript without generating JavaScript files.

### Create a production build

```bash
npm run build
```

Result:

- Next.js compiled successfully.
- TypeScript checks passed.
- Static pages were generated.
- Dynamic API routes were recognized.

### Verify project identity

```bash
node -p "require('./package.json').name"
node -p "require('./package-lock.json').name"
```

The results did not match:

```text
cloudops-command-center
opspilot-saas
```

This revealed stale metadata copied from the OpsPilot project.

### Attempt automatic lockfile regeneration

```bash
npm install --package-lock-only --ignore-scripts
```

This corrected the name but also removed many unrelated `libc` metadata entries.

The broad change was rejected and restored:

```bash
git restore package-lock.json
```

Lesson: generated changes must still be reviewed. A successful command does not guarantee a desirable diff.

### Apply the minimal package identity correction

The two stale `opspilot-saas` name fields in `package-lock.json` were changed to:

```json
"name": "cloudops-command-center"
```

The change was inspected with:

```bash
git diff -- package-lock.json
```

Only two replacements remained.

### Check staged changes

```bash
git add package-lock.json docs/LEARNING-JOURNAL.md
git status -sb
git diff --cached --stat
git diff --cached --check
```

`git diff --cached --check` detected trailing whitespace in the learning journal.

The whitespace was removed in VS Code and the file was staged again.

### Commit the baseline work

```bash
git commit -m "chore: document baseline and correct package identity"
```

Commit created:

```text
807384c chore: document baseline and correct package identity
```

### Confirm a clean working tree

```bash
git status -sb
git log -1 --oneline --decorate
```

The working tree was clean after the commit.

---

## Session 2 — Shared operational finding contract

**Date:** 18 July 2026
**Branch:** `codex/external-findings-v1`

### Goal

Create a language-neutral contract that allows PlatformPilot to send Kubernetes findings to CloudOps Command Center.

PlatformPilot may be written in Python while CloudOps uses TypeScript. JSON Schema gives both projects the same external data contract without requiring them to share programming-language types.

### Inspect existing CloudOps types

```bash
sed -n '1,180p' lib/types.ts
```

The existing types include:

- Infrastructure signals
- Risks
- Severity
- Approval status
- Audit events
- Runbooks
- Service ownership
- Integrations

### Create the contract schema

```bash
touch contracts/operational-finding.schema.json
```

The schema defines:

- Schema version
- Finding identity
- Source
- Observation time
- Environment
- Kubernetes resource location
- Service
- Category
- Severity
- Confidence
- Summary
- Evidence
- Recommended runbook
- Required human approval
- Correlation identity

### Validate JSON syntax

```bash
node -e "JSON.parse(require('fs').readFileSync('contracts/operational-finding.schema.json', 'utf8')); console.log('Schema JSON is valid')"
```

Result:

```text
Schema JSON is valid
```

This only checked JSON syntax. It did not yet prove that findings obeyed the schema.

### Create example files

```bash
mkdir -p contracts/examples
touch contracts/examples/platform-pilot-valid.json
touch contracts/examples/platform-pilot-invalid.json
```

The valid example represents a local Kubernetes Pod in `CrashLoopBackOff`.

The invalid example intentionally contains:

- An empty finding ID
- An unsupported source
- An invalid timestamp
- Invalid environment, category, and severity values
- Confidence greater than one
- Empty summary and evidence
- Approval set to false
- An unexpected property

### Check whether AJV was already available

```bash
npm ls ajv
```

AJV 6 was present only as a transitive ESLint dependency.

It was not suitable for direct application use or JSON Schema draft 2020-12.

### Install AJV 8

```bash
npm install --save-dev ajv@^8
```

Result:

- AJV 8.20.0 installed directly.
- AJV 6.15.0 remained nested beneath ESLint.

Multiple versions are acceptable because each tool uses its required version.

### Install date-time format validation

```bash
npm install --save-dev ajv-formats@^3
```

`ajv-formats` validates fields such as:

```json
"observedAt": "2026-07-18T18:45:00Z"
```

### Inspect generated dependency changes

```bash
git status -sb
git diff --stat
git diff -- package.json
git diff -- package-lock.json
```

The lockfile contained expected AJV dependency changes and npm 10 also removed `libc` metadata from optional Linux packages.

No application dependency was removed. This lockfile normalization must still be verified before committing.

### Create the reusable validator

```bash
touch scripts/validate-operational-finding.mjs
```

The validator:

- Loads the schema.
- Loads a finding payload.
- Compiles the schema with AJV 8.
- Adds date-time format validation.
- Reports all validation errors.
- Returns exit code `0` for valid data.
- Returns exit code `1` for invalid data.

### Validate the correct example

```bash
node scripts/validate-operational-finding.mjs
```

Result:

```text
Operational finding is valid: contracts/examples/platform-pilot-valid.json
```

### Validate the deliberately broken example

```bash
node scripts/validate-operational-finding.mjs contracts/examples/platform-pilot-invalid.json
```

The validator correctly rejected all invalid fields.

### Improve unclear validation output

The first error originally said:

```text
/: must NOT have additional properties
```

The validator was improved to include the exact unexpected property:

```text
/: must NOT have additional properties: unexpectedField
```

### Debugging issue: unsaved source file

After the first edit, the output did not change because the saved file still contained the old code.

Lesson: Node.js executes the file saved on disk, not unsaved editor contents.

Fix:

1. Replace the correct code block.
2. Press `Command + S`.
3. Run the command again.

### Debugging issue: unexpected `catch`

An edit accidentally removed:

```javascript
process.exit(1);
}
```

Node reported:

```text
SyntaxError: Unexpected token 'catch'
```

The `catch` keyword was not the real problem. The earlier `if` block was missing its closing brace.

Lesson: syntax errors are sometimes reported where the parser finally becomes confused, not where the mistake began.

### Add a reusable npm command

The following script was added to `package.json`:

```json
"contracts:validate": "node scripts/validate-operational-finding.mjs"
```

It can now be run with:

```bash
npm run contracts:validate
```

Result:

```text
Operational finding is valid: contracts/examples/platform-pilot-valid.json
```

### Current result

CloudOps Command Center now has:

- A versioned operational finding schema.
- A valid PlatformPilot example.
- An invalid debugging example.
- AJV 8 schema validation.
- Date-time format validation.
- Human-readable validation errors.
- A reusable npm command.
- Recorded debugging lessons.

### Automated contract tests

A new Vitest file was created:

```text
tests/operational-finding-contract.test.ts
```

The tests execute the real command-line validator in a separate Node.js process.

The positive test confirms:

- The valid PlatformPilot finding returns exit code `0`.
- Success output is written to standard output.
- Standard error remains empty.

The negative test confirms:

- The invalid PlatformPilot finding returns exit code `1`.
- Validation errors are written to standard error.
- The unexpected property and invalid confidence are reported.

Run the focused contract tests:

```bash
npm run test -- tests/operational-finding-contract.test.ts
```

Result:

```text
Test Files  1 passed
Tests       2 passed
```

Run the complete test suite:

```bash
npm run test
```

Result:

```text
Test Files  7 passed
Tests       19 passed
```

### Final verification

The following checks passed:

```bash
npm run contracts:validate
npm run test
npm run lint
npm run typecheck
npm ci
npm run build
```

The clean `npm ci` installation proved that `package.json` and `package-lock.json` agree.

The production build completed successfully and preserved all existing application and API routes.

### Next step

Create the CloudOps ingestion layer that accepts validated PlatformPilot findings, maps them into internal CloudOps risks, and prevents duplicates.
