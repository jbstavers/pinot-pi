# Pinot

Package identity: `@jbstavers/pinot-pi`; display name: Pinot.

Pinot is an independent workflow package for the Pi coding agent. It is not affiliated with, sponsored by, or endorsed by Apache Pinot; the shared display name is intentional and this project concerns Pi coding-agent workflows.

This repository is an early bootstrap. Work Units 0–2 establish the safe package boundary, explicit configuration/state foundation, and bounded background delegation. Durable implementation, workflows, ledger, and closeout features are later work and are not included yet.

## Requirements

- Pi 0.84.1 is the currently exercised Pi contract.
- Node.js 22.19.0 or newer.
- macOS and Linux are the intended v0.1 platforms; Windows is unverified.
- Herdr and Python are checked by status when available, but Pinot does not install them. They are not needed to load the package or use setup/status.

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

`/pinot-setup` is explicit, idempotent, owner-safe, and non-overwriting. It creates the user-owned state root, a blank role/model configuration, implementation-history and ledger directories, and missing template files. It never edits Pi settings, authentication, or sessions.

State defaults to `~/.pinot-pi`. The one Pinot override is the absolute `PINOT_STATE_DIR` environment variable. The package checkout and installed package clone are never state locations.

## State boundary

The setup-created paths are:

- `config.json` — user-owned role/model mappings in `provider/model:thinking` form; no provider or model is bundled.
- `implementation-history/` — reserved for later semantic implementation records.
- `subagent-use-ledger/` — reserved for later aggregate ledger cursor and reports.

The Pi agent directory and current session location are reported from Pi's supported `getAgentDir()`, session-manager API, and documented `PI_CODING_AGENT_*` defaults. Pinot does not read auth, settings, or session content during setup/status. Status validates each role/effort mapping against Pi's model registry without resolving credentials; blank setup mappings are reported individually.

## Development

```bash
npm install
npm test
npm run typecheck
npm run package:dry-run
```

The production package contains only the explicit Pi extension, source foundation, templates, and public documentation. Local test output, checkpoints, sessions, dependencies, and generated state are ignored.

## Project documents

- [`docs/architecture.md`](docs/architecture.md) — package and state design.
- [`SECURITY.md`](SECURITY.md) — permissions, trust, and data boundaries.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — public contribution process.
- [`AGENTS.md`](AGENTS.md) — concise agent-facing safety guidance.

## Background delegation

`pinot_delegate_background` runs one ephemeral, read-only worker for a bounded scout, assessor, second opinion, reviewer, or evidence-only verifier assignment. It returns a compact checkpoint-v4 report with separate checkpoint and process outcomes, deadline/cancellation/shutdown, kill-attempt, and closure-observation metadata, bounded usage, and public mechanical details only; assignment text, checkpoint text, temporary paths, and settings hashes stay out of tool details. Workers have only `read`, `grep`, `find`, and `ls`; they cannot edit, run shell commands, or recursively delegate.

Role models come from the configured `models` mappings. The parent resolves only the selected provider through Pi's `getProviderAuth()` API and hands the child a mode-0600 temporary bridge. A package-owned child bootstrap consumes and unlinks it, registers the built-in provider override, and uses an isolated child config/session directory. Pinot never copies or symlinks full auth/settings files, puts credentials in argv or results, or falls back to user configuration. External-source scouting is rejected unless `externalSourceExtension` names an explicitly configured compatible extension; no web or RTK extension is bundled.

The read-only boundary is canonical-root and symlink aware, but it is not an operating-system sandbox. Pi packages run with the user's full permissions and should be installed only after reviewing the source.

## Maturity and attribution

Pinot is experimental bootstrap software for Pi workflows. It was developed with AI assistance under maintainer architectural direction; generated changes remain subject to human review, focused tests, and privacy review.
