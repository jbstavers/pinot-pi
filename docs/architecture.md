# Architecture

## Package boundary

Pi loads `extensions/pinot.ts` from the explicit `pi` manifest. The extension registers `/pinot-setup` and `/pinot-status` but does not perform I/O during factory load. Package resources are immutable and may be reset by Pi's Git-package reconciliation, so user data never belongs in the checkout.

The implementation is split into six small layers:

1. `prompts/` defines generic `/pinot-*` workflow templates for specification, planning, implementation, debugging, debrief, and Janitor closeout.
2. `skills/pinot-janitor/` defines the package-owned sole-writer closeout/helper contract and its relative references.
3. `src/config/` defines the generic role/model configuration format and command schema.
4. `src/state/` resolves the state root, validates safe ownership/permissions, inspects state without writing, and performs explicit idempotent setup.
5. `src/delegation/` defines the typed assignment/checkpoint contract, bounded child process, credential bridge/bootstrap, canonical-root read tools, and compact result.
6. `src/implementation/` defines the Pi-session-first Herdr lifecycle, context guard, package-relative child support, and exact test-suite runner; `extensions/` adapts these functions to Pi commands, tools, and prerequisite reporting.

## Workflow resources and ownership

Pi discovers the six prompt templates from the explicitly declared `pi.prompts` directory and the Janitor skill recursively from the explicitly declared `pi.skills` directory. The prompts use configured Pinot state/history roots and current project evidence only. They do not load a personal prompt set, UI history, named provider/model, or another repository’s instructions.

`/pinot-implement` and `/pinot-janitor` require valid Herdr and never substitute root editing or an ephemeral worker. The implementation coordinator keeps one durable writer; after its host is closed, a fresh Janitor specialist is the sole closeout writer. Janitor may touch only assigned project documentation/high-confidence ephemeral files and the exact history-root exception supplied by the coordinator. It uses no-overwrite append-only records and safe exact spec/plan snapshots, while preserving uncertainty.

Implementation history is semantic evidence for Debrief. This unit pulls forward the history-schema scaffold: it points to root/child provenance, review, verification, deviations, remaining work, and snapshot files. Aggregate ledger paths/coverage ends are period references only and do not attribute metrics to one implementation. Unit 5 owns scanner/launcher and no-overwrite integration; this package does not claim them.

## State ownership

The default root is `~/.pinot-pi`. The only documented Pinot override is the absolute `PINOT_STATE_DIR` environment variable. Derived paths are stable:

```text
~/.pinot-pi/
├── config.json
├── implementer/
│   ├── sessions/<name>/
│   └── checkpoints/<name>.md
├── implementation-history/
└── subagent-use-ledger/
```

Setup preflights every target before creating any state path. It refuses symlinks, unsafe ownership or permissions, non-directory destinations, and conflicting paths without partial writes. Created directories use exact mode `0700`; created files use exact mode `0600`. It does not replace an existing configuration. Repeating setup is a no-op apart from reporting already-present paths.

## Pi discovery and prerequisites

The extension uses Pi's supported `getAgentDir()` helper and `ctx.sessionManager.getSessionFile()` API. Where Pi supplies documented environment overrides, it reports `PI_CODING_AGENT_DIR` and `PI_CODING_AGENT_SESSION_DIR`; otherwise it reports the documented defaults. It never guesses a machine-specific path or reads authentication/settings/session contents.

Status checks Node, Python, and the Herdr executable without installing anything. It invokes the read-only `herdr integration status` command and reports installed/current Pi integration separately from whether the current parent has `HERDR_ENV` active. Configuration status parses each provider/model:thinking mapping, reports every empty role/effort mapping, and checks configured provider/models against Pi's model registry without reading auth. Optional web capability is reported as not required by this bootstrap; later delegation must make any external-source extension explicit.

Permanent application logging is intentionally unwarranted in this non-service bootstrap: there is no application log file, logger configuration, or debug mode. Commands return bounded diagnostics through Pi. The test tool's complete combined logs live under the default ignored project `+test-output/` directory, or an explicitly supplied safe Pinot state-root directory via `logRoot`; Pinot performs no automatic rotation or retention cleanup, so the user removes these diagnostic logs when no longer needed.

## Bounded background delegation

`pinot_delegate_background` loads one role model from the Unit 1 config API and requires a built-in provider/model available in the parent registry. The parent calls only `getProviderAuth(provider)`, validates the supported `apiKey`/headers/baseUrl/environment shape, and writes that selected result to a temporary mode-0600 bridge. A package-owned child bootstrap reads and immediately unlinks it, applies provider-scoped environment values, and calls `registerProvider` with the resolved request settings. The child has isolated config/session directories and no user extensions, skills, context files, or settings.

Child output is capped at 50 KB/2,000 lines. The parser accepts the last valid checkpoint-v4 object; malformed output becomes an explicit incomplete checkpoint rather than raw worker text. Process outcomes (`completed`, `timed_out`, `cancelled`, `spawn_failed`, `exited_nonzero`) remain separate from checkpoint status and include deadline, shutdown, kill-attempt, and closure-observation metadata. Public tool details/updates contain only role, model, usage, elapsed/process/progress metadata, checkpoint counts/status/confidence, and settings-unchanged; assignment text, checkpoint strings, output, paths, and hashes remain internal or compact-content-only. Tool usage is returned as nested usage for Pi accounting, while parent text redacts credential-shaped values and remains bounded.

The child read tools enforce a canonical project root and reject symlink escapes. This is not an OS sandbox. External-source scouting requires the configured `externalSourceExtension`; no web or RTK extension is bundled. Temporary bridge/config/session cleanup is attempted on every parent-side outcome.

## Durable Herdr implementation

`pinot_native_herdr_implementer` exposes explicit `start`, `resume`, `follow_up`, `compact`, `wait`, and `close` actions. A Pi JSONL session under the user-owned Pinot state root is the durable child identity; Herdr's named agent and pane are only the current host attachment. The lifecycle refuses duplicate names/writers, requires exact session/name/cwd matching, recovers immutable profile, model, and thinking metadata from the child session rather than changing them on resume, and closes only the verified host while preserving the same session identity. `implementation` is the default start-only profile; Janitor starts select `janitor` and explicitly load the package-owned skill, while resume and lifecycle actions reject missing or conflicting profile records. Close additionally requires a regular checkpoint, a settled/nonfailed guard, an idle/done host, and bounded verification that the Herdr host disappeared.

Pane creation has a final preflight boundary. Pinot checks `HERDR_ENV=1`, the active socket and parent pane, Herdr 0.7.5 or newer, a running server, current Pi integration, and the requested project attachment before checking the available exact built-in model, custom-provider restrictions, and selected provider auth. Invalid Herdr/topology therefore never touches provider authentication. Auth crosses the process boundary through one mode-0600 state-root bridge passed by environment; the package-relative child support extension consumes and unlinks it before registering the built-in provider override. The bridge is removed by the parent on every outcome. Pinot never places credentials in arguments, checkpoints, results, or persistent metadata.

The child guard records automatic and explicit compaction cycles as session custom entries. The parent waits for pending cycles to settle, requires a new settled cycle for explicit compaction, measures context from successful assistant usage, and requires a regular fresh checkpoint after writing actions. Public details contain only child ID, sanitized host/status/model/context/guard data, and checkpoint presence/size/freshness. Completed `start`, `resume`, `follow_up`, and `wait` results carry bounded, redacted checkpoint-v4 text in semantic content, not details. A still-working result is a bounded handoff: call `wait` again and do not close it.

## Exact test execution

`pinot_run_test_suite` canonicalizes the project cwd and confines logs to an owner-only `+test-output/` directory that Git proves ignored before creation/writing, or to an explicitly supplied external Pinot state-root directory. It tokenizes one executable plus literal arguments and rejects shell operators, so project-controlled shell interpolation is not part of the tool contract. It uses a detached process group, bounded timeout, cancellation/termination, and complete combined output—including spawn errors—in a mode-0600 log. Tool content/details return only mechanical status and a non-absolute logical log location; raw output is never returned.

## Future seams

The typed state/config API is intentionally shared by delegation, durable implementation, tracker, ledger launcher, and documentation. No workflow or setup fallback may write project files, copy auth, or silently substitute root editing for a missing durable prerequisite.
