# Architecture

Pinot is a Pi package that layers namespaced resources onto an existing Pi setup. The extension registers `/pinot-setup` and `/pinot-status`, the six prompt templates are discovered from `prompts/`, and the Janitor skill is discovered from `skills/pinot-janitor/`. Loading the extension performs no file writes.

## Layers

1. `prompts/` contains generic specification, planning, implementation, debugging, Debrief, and Janitor prompts.
2. `skills/pinot-janitor/` contains the Janitor contract and package-relative references.
3. `src/config/` parses role and implementer-effort model mappings in `provider/model:thinking` form and checks them against Pi’s registry.
4. `src/state/` resolves the user-owned state root, validates ownership and permissions, inspects state, and performs explicit idempotent setup.
5. `src/delegation/` provides the bounded read-only child contract, temporary auth bridge, canonical-root tools, and checkpoint result.
6. `src/implementation/` provides the Herdr-backed durable child lifecycle, context guard, child support, and bounded test runner.

## User-owned state

The default root is `~/.pinot-pi`; `PINOT_STATE_DIR` may provide an absolute alternative:

```text
~/.pinot-pi/
├── config.json
├── implementer/
│   ├── sessions/<name>/
│   └── checkpoints/<name>.md
└── implementation-history/
```

Setup preflights every target, rejects symlinks and unsafe ownership or permissions, creates directories as `0700` and files as `0600`, and never replaces existing files. The package checkout is not a state location. History templates are semantic records used by the Debrief and Janitor prompts.

## Status and safety

Status reads Pinot state, supported Pi location metadata, the Herdr integration status, and model availability through Pi’s registry. It does not read authentication or session contents and does not install anything. There is no permanent application log; test-suite output is temporary diagnostic output in an ignored project directory or supplied Pinot state directory.

Pi packages have the user’s permissions. Delegation is read-only at the child-tool boundary and checks the canonical project root, but it is not an operating-system sandbox. The durable implementer and Janitor use Herdr’s separately configured environment, verify the project attachment and child identity, and refuse parent-side editing when their durable prerequisites are missing.
