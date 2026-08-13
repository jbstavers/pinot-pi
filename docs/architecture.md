# Architecture

## Package boundary

Pi loads `extensions/pinot.ts` from the explicit `pi` manifest. The extension registers `/pinot-setup` and `/pinot-status` but does not perform I/O during factory load. Package resources are immutable and may be reset by Pi's Git-package reconciliation, so user data never belongs in the checkout.

The implementation is split into three small layers:

1. `src/config/` defines the generic role/model configuration format and command schema.
2. `src/state/` resolves the state root, validates safe ownership/permissions, inspects state without writing, and performs explicit idempotent setup.
3. `extensions/` adapts those functions to Pi commands and reports supported Pi locations and prerequisite status.

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

## Future seams

The typed state/config API is intentionally shared by later delegation, durable implementation, tracker, ledger launcher, and documentation. This slice does not implement those consumers. In particular, no workflow or setup fallback may write project files, copy auth, or silently substitute root editing for a missing durable prerequisite.
