# Architecture

## Package boundary

Pi loads `extensions/pinot.ts` from the explicit `pi` manifest. The extension registers `/pinot-setup` and `/pinot-status` but does not perform I/O during factory load. Package resources are immutable and may be reset by Pi's Git-package reconciliation, so user data never belongs in the checkout.

The implementation is split into four small layers:

1. `src/config/` defines the generic role/model configuration format and command schema.
2. `src/state/` resolves the state root, validates safe ownership/permissions, inspects state without writing, and performs explicit idempotent setup.
3. `src/delegation/` defines the typed assignment/checkpoint contract, bounded child process, credential bridge/bootstrap, canonical-root read tools, and compact result.
4. `extensions/` adapts those functions to Pi commands, delegation, and prerequisite reporting.

## State ownership

The default root is `~/.pinot-pi`. The only documented Pinot override is the absolute `PINOT_STATE_DIR` environment variable. Derived paths are stable:

```text
~/.pinot-pi/
├── config.json
├── implementation-history/
└── subagent-use-ledger/
```

Setup preflights every target before creating any state path. It refuses symlinks, unsafe ownership or permissions, non-directory destinations, and conflicting paths without partial writes. Created directories use exact mode `0700`; created files use exact mode `0600`. It does not replace an existing configuration. Repeating setup is a no-op apart from reporting already-present paths.

## Pi discovery and prerequisites

The extension uses Pi's supported `getAgentDir()` helper and `ctx.sessionManager.getSessionFile()` API. Where Pi supplies documented environment overrides, it reports `PI_CODING_AGENT_DIR` and `PI_CODING_AGENT_SESSION_DIR`; otherwise it reports the documented defaults. It never guesses a machine-specific path or reads authentication/settings/session contents.

Status checks Node, Python, and the Herdr executable without installing anything. It invokes the read-only `herdr integration status` command and reports installed/current Pi integration separately from whether the current parent has `HERDR_ENV` active. Configuration status parses each provider/model:thinking mapping, reports every empty role/effort mapping, and checks configured provider/models against Pi's model registry without reading auth. Optional web capability is reported as not required by this bootstrap; later delegation must make any external-source extension explicit.

Permanent application logging is intentionally unwarranted in this non-service bootstrap. Commands return bounded diagnostics through Pi; focused test diagnostics, when retained, live under ignored `+test-output/` and have no release or retention claim.

## Bounded background delegation

`pinot_delegate_background` loads one role model from the Unit 1 config API and requires a built-in provider/model available in the parent registry. The parent calls only `getProviderAuth(provider)`, validates the supported `apiKey`/headers/baseUrl/environment shape, and writes that selected result to a temporary mode-0600 bridge. A package-owned child bootstrap reads and immediately unlinks it, applies provider-scoped environment values, and calls `registerProvider` with the resolved request settings. The child has isolated config/session directories and no user extensions, skills, context files, or settings.

Child output is capped at 50 KB/2,000 lines. The parser accepts the last valid checkpoint-v4 object; malformed output becomes an explicit incomplete checkpoint rather than raw worker text. Process outcomes (`completed`, `timed_out`, `cancelled`, `spawn_failed`, `exited_nonzero`) remain separate from checkpoint status and include deadline, shutdown, kill-attempt, and closure-observation metadata. Public tool details/updates contain only role, model, usage, elapsed/process/progress metadata, checkpoint counts/status/confidence, and settings-unchanged; assignment text, checkpoint strings, output, paths, and hashes remain internal or compact-content-only. Tool usage is returned as nested usage for Pi accounting, while parent text redacts credential-shaped values and remains bounded.

The child read tools enforce a canonical project root and reject symlink escapes. This is not an OS sandbox. External-source scouting requires the configured `externalSourceExtension`; no web or RTK extension is bundled. Temporary bridge/config/session cleanup is attempted on every parent-side outcome.

## Future seams

The typed state/config API is intentionally shared by later delegation, durable implementation, tracker, ledger launcher, and documentation. No workflow or setup fallback may write project files, copy auth, or silently substitute root editing for a missing durable prerequisite.
