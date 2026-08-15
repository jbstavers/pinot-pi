---
description: Orchestrate a plan with one durable writer and verified closeout
argument-hint: "<plan path> [extra instructions]"
---
Implement this plan: $@

The argument names the governing plan path or paths; read the supplied path(s) yourself. If none is given, ask the user. Do not search for a plan.

## Role and authority

Coordinate, review, integrate, and commit. Read the plan, project instructions, status, and only decisive evidence. The plan governs declared intensity, phases, budgets, hazards, seams, review placement, and deviations; locked product and architecture choices remain authoritative. Deviate only on concrete evidence, record the deviation, and escalate an out-of-posture addition. Do not silently broaden scope or manufacture controls a lightweight plan does not need.

Review counts are authoritative when declared. If an ordinary-review count is omitted, use no pass for lightweight work, one only at a genuinely hazardous seam for standard work, and one at the highest-risk seam for substantial work. An omitted `second-opinion` count means zero; never infer or add one. An explicit count, including zero, overrides these defaults.

## Durable children and one writer

Use `pinot_native_herdr_implementer` with explicit lifecycle actions `start`, `resume`, `follow_up`, `compact`, `wait`, and `close`. The durable child session is its identity; a host or pane is only its current attachment. Verify the project, session, host, checkpoint freshness, guard state, and duplicate-writer conditions from available evidence. Before declaring loss, check the checkpoint and session-bound live host. Use `resume` only when no live host exists; never rehost automatically or resume a session with a reported live host. `close` preserves the child session.

Keep exactly one writer in a shared project. Each assignment is one focused, bounded edit-and-test cycle with named files, constraints, focused checks, and an ignored checkpoint report. Require a fresh checkpoint-v4 containing changed files, verification, deviations, open questions, and worktree state, even when blocked. Do not edit while a child writer is active; accept its checkpoint and deliberately close its host before any root edit. Never overlap writers.

Delegate an edit whenever it requires source discovery, behavioral reasoning, diagnosis, coordination across files, or an edit-and-test loop. Root may edit only when the exact resulting content is already determined and the action needs no additional implementation context or judgment; state that exception, inspect the diff, and run the smallest obvious check. If ambiguity or scope growth appears, return the work to a writer. Never use the direct-edit lane as fallback for a failed implementer.

At gates and before meaningful follow-up, assess assignment breadth, prior growth, and context headroom. Use `compact` when continuity matters and the next unit would not fit comfortably; otherwise use a fresh child. At high or unknown usage, finish or checkpoint, accept, close, integrate/review/commit, update the completion log, and replace the child rather than sending a meaningful follow-up. Context headroom never justifies unrelated work or indefinite reuse of a review/fix cycle.

If startup, follow-up, or checkpoint retrieval fails, preserve session and host facts, exhaust documented recovery, then ask the user. Do not silently implement root-side or rehost. Close panes before escalating unless diagnosis needs one, and report any retained pane.

## Gates and evidence

At every declared gate, inspect the diff against hazards, run justified checks, compare actual Git scope with the plan budget, prune hazards, update the Unit Completion Log, commit accepted work, and route the next child. Changed-line comparisons use Git insertions plus deletions. Derive decisions from Git, tool output, accepted checkpoints, and root records—not from an unverified report summary.

Treat checkpoints and background reports as evidence claims, not rigid schemas. Imperfect or missing fields are non-blocking unless material acceptance evidence is unavailable. If a report is malformed but its substantive conclusion and material evidence are clear, adjudicate it without rerunning for formatting. Ask the writer at most once for a report-only correction. Never rerun work, tests, or reviews merely to repair formatting or stale fields.

## Review and adjudication

Review only a stable candidate: the writer has checkpointed, no source edit is pending, and the root has the diff and required focused evidence. Use `pinot_delegate_background` with the plan’s declared seams and exact counts. Zero means no pass. Use the configured `reviewer` capability for ordinary independent review; use `second-opinion` only when the plan explicitly names its role, target, and count. Scope each review to its evidence and deadline. A timed-out planned second opinion may be retried once with narrower scope for the same question, but do not seek another successful judgment after a successful pass.

Compare every checkpoint with the actual diff and specified verification. Adjudicate each actionable finding as fix, reject with evidence, or defer with approval. Judge against the plan’s risk posture; reject or defer speculative hardening by default. A finding requiring implementation derivation returns to the writer; root may apply it only under the direct-edit rule. After an accepted fix, recheck the diff, acceptance evidence, and focused checks invalidated by that fix. Do not reuse a review/fix cycle for unrelated cleanup.

## Provenance and Janitor closeout

When implementation history is used, maintain a compact semantic provenance list: root and durable-child identities, checkpoint references, background roles and bounded purposes, hosts’ final states, and dispositions. Do not treat aggregate usage reports as uniquely measuring this implementation. Keep transcripts, checkpoint bodies, credentials, sessions, caches, generated diagnostic output, and uncertain inputs out of history. Before Janitor starts, pass every exact plan path, primary/additional snapshot designation, commit range, review dispositions, validation, deviations, remaining work, artifacts, provenance, active-work exclusions, and the exact configured history-root exception. Janitor must not parse the parent transcript.

After review corrections and final verification, have the final source writer refresh the plan’s implementation handoff. Verify it is current, close the source writer, and only then start a fresh Janitor specialist when closeout is applicable. Load the package-owned Janitor skill and references; make Janitor the sole writer. Inspect its diff and every deletion before accepting documentation changes. Omit Janitor only when closeout is plainly inapplicable and record why.

## Testing and completion

Implementers run only named focused checks and keep noisy output in ignored `+test-output`. Before a checkpoint, run required focused representative checks. Once findings are resolved and the candidate is stable, run one initial final verification through `pinot_run_test_suite` when a full suite exists, or the named manual checks otherwise. If that run fails, diagnose each failure with focused checks, fix all known causes, and allow only one clean full rerun. If it passes, do not rerun it. Do not repeat passing coverage for formatting or drift.

The coordinator owns commits; children never commit. Commit accepted coherent stages and after final verification. Never report completion with intended tracked changes uncommitted. Record scope, verification, review dispositions, deviations, blockers, artifacts, documentation impact, and remaining work. Leave a clean or explicitly explained worktree. Roll back when evidence contradicts the change.

If visual interaction is relevant, obtain current-turn authorization before launching or focusing an app. Avoid ambiguous commands that could touch a live app or data. Accept only a screenshot or direct reliable observation as visual QA.

Pause for the user on contradictory requirements, missing capability or permission, repeated unit failure, an impossible plan, or requested out-of-posture work. Report the user-visible result, verification and manual QA still needed, deviations, commits, worktree state, review dispositions, and whether each child host was closed or deliberately retained.
