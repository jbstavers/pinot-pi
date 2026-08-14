# Pinot workflow contract

Pinot adds generic prompt templates to Pi. Invoke them as `/pinot-spec`, `/pinot-plan`, `/pinot-implement`, `/pinot-debug`, `/pinot-debrief`, and `/pinot-janitor`. They are project workflows, not personal defaults: they use the current project, documented project instructions, Pinot’s configured tools/state, and explicitly supplied history paths.

## Closed loop

```text
/pinot-spec → /pinot-plan → /pinot-implement → review → Janitor → implementation history
                                             ↘ /pinot-debrief ↗
```

### `/pinot-spec`

Explores a product or feature idea into a living Markdown specification. It resumes an established project specification when one is identified, asks only outcome-changing questions, separates observations from decisions, and converges explicitly. It does not plan or implement.

### `/pinot-plan`

Turns a brief or converged specification into a standalone executor-ready plan grounded in the current project. It records behavior, boundaries, evidence, proportional controls, verification, rollback, review, provenance, documentation, and unresolved questions without inventing models, providers, paths, commands, or dependencies.

### `/pinot-implement`

Coordinates the plan with exactly one writer. It requires valid Herdr and Pi integration before writing and uses `pinot_native_herdr_implementer` actions `start`, `resume`, `follow_up`, `compact`, `wait`, and `close`. The Pi child session is durable; the Herdr host is a verified attachment. Missing Herdr, host, model, integration, checkpoint, or recovery conditions cause a clear refusal—never a root-edit or ephemeral-worker fallback.

The coordinator preserves fresh checkpoint-v4 handoffs, diagnoses failed tests before editing or rerunning, runs the exact focused/final command through `pinot_run_test_suite`, performs the declared review and adjudication, owns commits, and passes semantic provenance to Janitor. A Janitor closeout is not started until the source writer is closed.

### `/pinot-debug`

Diagnoses independently with bounded evidence, even when Herdr is unavailable. After the cause is established, any production fix is routed through exactly one bounded durable `pinot_native_herdr_implementer` using the start-only `implementation` profile; diagnosis never root-edits, directly edits, or falls back to an ephemeral worker. It verifies the original symptom and sibling patterns afterward. It does not turn logs, internal state, or metadata into visual proof.

### `/pinot-debrief`

Looks up the configured implementation-history index first, follows the selected record’s safe pointers, and verifies consequential claims directly. It keeps semantic provenance separate from aggregate ledger periods. Unit 5’s ledger scanner/launcher and no-overwrite integration are not available in this package slice, so absent reports are stated honestly. Transcripts, checkpoint bodies, credentials, sessions, caches, generated reports, and uncertain inputs are not copied into history or debrief artifacts.

### `/pinot-janitor`

Requires an exact `closeout`, `docs`, or `sweep` mode. It starts a fresh durable `pinot_native_herdr_implementer` with the start-only `janitor` profile, explicitly loads the package-owned `pinot-janitor` skill, and records immutable profile metadata in the child Pi session. Resume and lifecycle actions recover and verify that metadata; missing or conflicting records refuse recovery. Without valid Herdr it refuses clearly. The specialist is the sole writer, does not commit or delegate, and edits only assigned documentation, high-confidence project-local ephemeral output, and the exact configured history-root exception supplied by the coordinator.

Janitor maintains append-only no-overwrite records, safe exact specification/plan snapshots, root/child provenance, review/verification/deviation/remaining-work fields, Debrief lookup pointers, and aggregate ledger-period references without claiming per-implementation attribution. Cleanup is classified `delete`, `retain`, or `unresolved`; uncertainty is retained. Janitor never infers authority over another repository.

## State and privacy boundary

The default state root is `~/.pinot-pi`, overridden only by `PINOT_STATE_DIR`; history and ledger roots derive from that configuration. Package updates may reset the installed clone, so mutable history, sessions, checkpoints, config, and reports stay outside it. Setup remains explicit, idempotent, and non-overwriting.

Pi packages have full user permissions. Read-only worker tools, canonical-root checks, Herdr host checks, durable-profile recovery, and owner-only state modes are safety boundaries, not OS sandboxing. Review package source before installation.
