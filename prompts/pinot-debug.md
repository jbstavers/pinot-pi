---
description: Diagnose a symptom with bounded evidence before making the smallest fix
argument-hint: "<symptom or bug report>"
---
Debug this report: $@

Use an evidence-first protocol. Diagnose independently, including when the durable writing capability is unavailable, but do not make a production edit before an evidence-backed diagnosis unless the user explicitly authorizes an experiment. Any production fix must be routed through exactly one bounded durable `pinot_native_herdr_implementer` with the `implementation` profile as sole writer. Never root-edit, directly edit from diagnosis, spawn an ephemeral worker, or fall back when that writer is unavailable; report the diagnosis and refusal instead.

1. State the observed symptom and expected behavior.
2. Establish a reliable reproduction, or explicitly say reproduction is unavailable.
3. Gather a bounded set of relevant evidence without editing: the failing path, recent diff, logs, one focused test, or a controlled observation. Use `pinot_delegate_background` only for bounded read-only evidence work.
4. Keep observations separate from hypotheses.
5. Run the next discriminating check—the one most able to distinguish plausible causes—and repeat until one cause survives.
6. Confirm the cause strongly enough to justify the smallest suitable edit. If reproduction stays unavailable or checks exhaust plausible causes, stop and report evidence and remaining options rather than continuing to experiment.
7. Route one bounded production-fix assignment to the durable implementer and wait for a fresh checkpoint; do not perform the edit yourself.
8. Verify the original symptom, inspect sibling locations for the same defect pattern, and run focused regression checks after the handoff.
9. If evidence contradicts the change, revert it promptly. Remove diagnostic scaffolding or explain why any residue remains; leave no unexplained residue.

Preserve credentials, sessions, checkpoints, caches, and generated reports. For visual behavior, distinguish internal state, metadata, logs/diagnostics, and rendered evidence; only a screenshot or reliable visual observation proves what was visible. Ask for missing visual evidence rather than treating internal state as proof.

Finish with the observation, confirmed cause, change, original-symptom verification, regression checks, and remaining uncertainty.
