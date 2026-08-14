---
description: Orchestrate a plan with one durable Herdr writer and verified closeout
argument-hint: "<plan path> [extra instructions]"
---
Implement this plan: $@

Read the supplied plan path yourself. Do not search for a plan. The plan governs scope, dependencies, hazards, review counts, verification, and deviations. Coordinate and verify; do not silently broaden it.

## Required durable execution

`/pinot-implement` requires a functioning Herdr environment and Pi integration. Before any writing action, verify `HERDR_ENV=1`, an active Herdr socket and parent host, the supported Herdr version, a running server, current Pi integration, the requested project attachment, and a configured exact built-in model. If any prerequisite is missing, stop with a direct setup error. Never edit the project from the root as a fallback, use an ephemeral worker, or weaken the durable lifecycle.

Use `pinot_native_herdr_implementer` with explicit actions `start`, `resume`, `follow_up`, `compact`, `wait`, and `close`. The Pi session is the durable child identity; the Herdr host is only its current attachment. Verify session, host, project, model, thinking level, checkpoint freshness, guard state, and duplicate-writer conditions. Recover only through the documented lifecycle. Close the verified host while preserving the child session.

## One writer and evidence

Keep exactly one writer in the shared project. Do not edit while the writer is active. Give each writer one bounded assignment and require a complete fresh checkpoint-v4 containing changed files, verification, deviations, open questions, and worktree state, even when blocked. Use focused tests named by the plan. Run one final test command through `pinot_run_test_suite` when the plan calls for it; retain complete output only in its configured ignored log location and report concise status. Diagnose failures before editing or rerunning.

Review only a stable candidate. Honor the plan’s exact reviewer and second-opinion counts. Adjudicate each finding as fix, reject with evidence, or approved deferral. Recheck invalidated focused verification after accepted fixes. Keep semantic implementation provenance separate from aggregate ledger-period evidence.

## Janitor handoff

After the final source-writer checkpoint and review corrections, record the final handoff: exact plan/spec paths, changed paths or commit range, review dispositions, verification, deviations, documentation impact, temporary artifacts and retention, and remaining work. Close the source writer before starting a fresh Janitor specialist. Invoke the package-owned `pinot-janitor` skill and give it the exact configured history root, supplied provenance, and a narrow scope. Janitor is the sole writer during closeout and must not infer authority over another repository. It must use no-overwrite records and safe exact snapshots, and it must classify uncertain cleanup as retain/unresolved.

The coordinator owns commits. Do not commit from the durable child. Do not claim ledger metrics are attributable to this implementation: the aggregate ledger is a separate configured period source and is unavailable until that integration is implemented. Keep transcripts, checkpoint bodies, credentials, sessions, caches, generated reports, and uncertain inputs out of history.
