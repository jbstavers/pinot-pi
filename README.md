# Pinot

Package identity: `@jbstavers/pinot-pi`; display name: Pinot.

Pinot is an independent workflow package for the Pi coding agent. It is not affiliated with, sponsored by, or endorsed by Apache Pinot; the shared display name is intentional and this project concerns Pi coding-agent workflows.

Pinot provides six generic Pi workflow prompts—`/pinot-spec`, `/pinot-plan`, `/pinot-implement`, `/pinot-debug`, `/pinot-debrief`, and `/pinot-janitor`—alongside the safe package boundary, explicit configuration/state foundation, bounded background delegation, and durable Herdr-backed implementer/final-test tools. The package-owned `pinot-janitor` skill supplies the closeout contract. Ledger scanning and launcher integration remain Unit 5 work and are not included here.

## Requirements

- Pi 0.84.1 is the currently exercised Pi contract.
- Node.js 22.19.0 or newer.
- macOS and Linux are the intended v0.1 platforms; Windows is unverified.
- Herdr 0.7.5 and its current Pi integration are the exercised durable-implementation contract. Herdr is checked but never installed by Pinot.
- Python is checked by status for later workflow support, but is not needed to load the package or use setup/status.

## Install and first setup

Review the source, then install a pinned Git ref using Pi's package manager:

```bash
pi install git:<host>/<repository>@<reviewed-tag>
```

Loading the package is non-writing. In Pi, run:

```text
/pinot-status
/pinot-setup
/pinot-status
```

`/pinot-setup` is explicit, idempotent, owner-safe, and non-overwriting. It creates the user-owned state root, a blank role/model configuration, implementer session/checkpoint roots, implementation-history and ledger directories, and missing template files. It never edits Pi settings, authentication, or existing sessions.

State defaults to `~/.pinot-pi`. The one Pinot override is the absolute `PINOT_STATE_DIR` environment variable. The package checkout and installed package clone are never state locations.

## State boundary

The setup-created paths are:

- `config.json` — user-owned role/model mappings in `provider/model:thinking` form plus neutral `implementerEffort.standard` and `implementerEffort.maximum` mappings; no provider or model is bundled.
- `implementer/sessions/<name>/` — durable Pi JSONL sessions for named Herdr implementers.
- `implementer/checkpoints/<name>.md` — user-owned fresh checkpoint handoffs.
- `implementation-history/` — append-only semantic implementation records, safe exact snapshots, provenance, review/verification, deviations, remaining work, Janitor maintenance, and Debrief lookup.
- `subagent-use-ledger/` — reserved for the Unit 5 aggregate ledger cursor and reports; Unit 4 records only honest period references.

The Pi agent directory and current session location are reported from Pi's supported `getAgentDir()`, session-manager API, and documented `PI_CODING_AGENT_*` defaults. Pinot does not read auth, settings, or session content during setup/status. Status validates each role/effort mapping against Pi's model registry without resolving credentials; blank setup mappings are reported individually.

## Workflows

The prompts are package resources, not personal UI or history settings. They use only the current project, Pinot tools, configured state root, and user-supplied history root. `/pinot-spec` converges a living product decision; `/pinot-plan` produces an evidence-grounded standalone plan; `/pinot-implement` coordinates one durable Herdr writer, review, verification, provenance, and Janitor closeout; `/pinot-debug` diagnoses independently but routes production fixes through that durable writer; `/pinot-debrief` follows implementation history before bounded fallback evidence; and `/pinot-janitor` starts the durable `janitor` profile with explicit package-skill loading for closeout, docs, or sweep mode.

Implementation and Janitor writing refuse without valid Herdr and never fall back to root editing. The implementer defaults to the start-only `implementation` profile; Janitor uses the start-only `janitor` profile and preserves immutable profile metadata across resume/lifecycle actions. Janitor is a sole-writer closeout specialist with no authority over another repository. History records are append-only and retain semantic provenance plus safe exact spec/plan snapshots; aggregate ledger references are period evidence only and do not attribute usage to one implementation. The ledger scanner and launcher are intentionally deferred to Unit 5.

See [`docs/workflows.md`](docs/workflows.md) for the user-facing workflow contract.

## Development

```bash
npm install
npm test
npm run typecheck
npm run package:dry-run
```

The production package contains the explicit Pi extension, six prompt templates, the package-owned Janitor skill and references, source foundation, implementer support resources, templates, and public documentation. Local test output, checkpoints, sessions, dependencies, and generated state are ignored.

## Project documents

- [`docs/architecture.md`](docs/architecture.md) — package and state design.
- [`SECURITY.md`](SECURITY.md) — permissions, trust, and data boundaries.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — public contribution process.
- [`AGENTS.md`](AGENTS.md) — concise agent-facing safety guidance.

## Background delegation

`pinot_delegate_background` runs one ephemeral, read-only worker for a bounded scout, assessor, second opinion, reviewer, or evidence-only verifier assignment. It returns a compact checkpoint-v4 report with separate checkpoint and process outcomes, deadline/cancellation/shutdown, kill-attempt, and closure-observation metadata, bounded usage, and public mechanical details only; assignment text, checkpoint text, temporary paths, and settings hashes stay out of tool details. Workers have only `read`, `grep`, `find`, and `ls`; they cannot edit, run shell commands, or recursively delegate.

Role models come from the configured `models` mappings. The parent resolves only the selected provider through Pi's `getProviderAuth()` API and hands the child a mode-0600 temporary bridge. A package-owned child bootstrap consumes and unlinks it, registers the built-in provider override, and uses an isolated child config/session directory. Pinot never copies or symlinks full auth/settings files, puts credentials in argv or results, or falls back to user configuration. External-source scouting is rejected unless `externalSourceExtension` names an explicitly configured compatible extension; no web or RTK extension is bundled.

The read-only boundary is canonical-root and symlink aware, but it is not an operating-system sandbox. Pi packages run with the user's full permissions and should be installed only after reviewing the source.

## Durable Herdr implementation and final tests

`pinot_native_herdr_implementer` manages one named durable Pi child through explicit `start`, `resume`, `follow_up`, `compact`, `wait`, and `close` actions. The Pi JSONL session is the durable child identity; Herdr manages the current terminal host and pane. Pinot verifies the active parent topology, matching child session/host/cwd, duplicate writers, immutable model/thinking metadata, guard cycles, and fresh checkpoints before it creates or rehosts a pane. `close` requires a regular checkpoint, a settled guard, an idle/done matching host, verified pane disappearance, and preserved session identity. It never falls back to parent editing. Herdr, `HERDR_ENV=1`, an active socket, and a current Pi integration are required for this tool.

The implementer preflights Herdr and the parent topology before resolving provider authentication. It resolves only the configured provider authentication through Pi's model registry, writes a one-use owner-only bridge in Pinot state, and passes only its path through the new pane environment. Package-relative child support consumes and removes that bridge before registering the built-in provider override. Exact built-in models are required; custom provider behavior is rejected. Public details expose durable IDs and sanitized mechanical status only. Completed writing/wait results include bounded, redacted checkpoint-v4 text in semantic content; paths and credentials remain out of details.

`pinot_run_test_suite` runs one exact executable-and-argument command without a shell, inside the selected canonical project cwd. It rejects shell syntax, bounds execution time, proves a project-local log root is Git-ignored before creating or writing it, and permits an external Pinot state-root log directory. Complete combined output, including spawn errors, is retained only in an owner-only mode-0600 log. The returned content/details contain only concise pass/fail/timeout/cancel/exit status and a non-absolute logical log location. There is no permanent Pinot application log or automatic log rotation; remove diagnostic logs explicitly when they are no longer needed.

## Maturity and attribution

Pinot is experimental bootstrap software for Pi workflows. It was developed with AI assistance under maintainer architectural direction; generated changes remain subject to human review, focused tests, and privacy review.
