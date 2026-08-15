---
description: Run explicit closeout, documentation, or conservative project cleanup
argument-hint: "<closeout|docs|sweep> [scope]"
---
Run Pinot Janitor in `${1}` mode for the optional scope `${@:2}`. The supplied request is: $@. If no mode is supplied, ask the user to choose `closeout`, `docs`, or `sweep`; do not silently default.

## Modes and authority

- `closeout` requires an identified implementation handoff in a tracked or ignored plan. An implementation-history closeout also requires the exact configured history-root exception supplied by the coordinator. Do not reconstruct work from transcripts.
- `docs` reviews durable project documentation against current behavior and instructions; do not change product behavior to make prose agree.
- `sweep` makes a bounded project-local inventory and classifies candidates as `delete`, `retain`, or `unresolved`; retain uncertainty.

Every Janitor run uses a fresh durable specialist started through `pinot_native_herdr_implementer` with the start-only `janitor` profile and explicit loading of the package-owned `pinot-janitor` skill and its relative references. If the required durable capability or skill context is unavailable, stop clearly. Never fall back to root editing, an ephemeral cleanup worker, or an unverified host.

Keep one writer total. The Janitor specialist is the sole writer while active and must not commit or delegate. It may edit assigned project documentation and high-confidence project-local ephemeral artifacts, plus the explicitly supplied history-root exception. It must not change product behavior or infer authority over another repository. Never delete tracked source/tests, active work, uncertain human input, credentials, authentication state, application data, sessions, checkpoints, caches, backups, generated reports, application logs, or anything outside scope.

## Closeout contract

Use the exact supplied handoff as the map; current implementation and Git state outrank aspirational prose. Preserve semantic provenance, review and verification, deviations, remaining work, documentation impact, and safe exact specification/plan snapshots. History is append-only: inspect the intended entry, index line, and snapshot filenames before writing; stop on collision or ambiguity and never overwrite or invent a suffix. Copy only exact safe regular specification and plan files supplied by the coordinator, with the primary plan as `plan.md` and deterministic descriptive slugs for additional plans. Never copy transcripts, checkpoint bodies, credentials, sessions, caches, generated diagnostic output, or uncertain inputs.

For `/pinot-implement`-originated work, the source writer must refresh the final handoff after review corrections and final verification, then close before Janitor starts. The closeout assignment must include every plan path, primary/additional snapshot designation, final changed paths or commit range, provenance, review dispositions, validation, known artifacts, active-work exclusions, and the exact history-root exception when applicable. Janitor must not parse the parent transcript or broadly reconstruct provenance.

Before delivery, answer bounded checkpoint questions from supplied root context or retain the uncertain item. Inspect the complete diff and every deletion, run only named checks, write a concise checkpoint covering changed/deleted paths, classifications, validation, open questions, and worktree state, and report the child continuity, changed paths, deletions, retained uncertainty, and commit status. Leave a stable, reviewable worktree.
