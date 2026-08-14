---
description: Turn a brief into an evidence-grounded executor-ready plan
argument-hint: "<brief>"
---
Use the following as the initial product brief: $@

Turn the brief into a strong, standalone implementation plan through focused dialogue with the user and grounding in the actual project. Make the product and technical work clear before adding execution controls.

## Planning posture

Prefer the smallest coherent change. Reuse existing architecture, tools, validation, and recovery paths. Add backups, migrations, repair paths, compatibility layers, generalized validators, new harnesses, fallbacks, or future abstractions only when project evidence or a user/data consequence earns them. Out-of-posture findings are report-only until approved.

Use current project configuration and authoritative documentation for system boundaries. Verify load-bearing integration requirements in the operating context. Trace the interaction from trigger to user outcome, including prerequisites and failure behavior. Do not invent commands, dependencies, fixtures, prerequisites, conventions, or named model/provider choices.

Ask only questions whose answers could change the outcome, operating context, user experience, data boundary, or scope. Play back goal, done, scope, decisions, and exclusions for confirmation before saving.

## Plan contents

Save at the project’s established planning location or `docs/+plans/<slug>-plan.md`. A fresh `/pinot-implement` run must be able to execute it without this conversation. Include only what the work earns:

- outcome, context, operating conditions, and unchanged important behavior;
- agreed behavior, boundaries, exclusions, and rationale;
- evidence and exact paths for instructions, source, tests, fixtures, commands, prerequisites, and documentation;
- proportional risk posture, safety, rollback, and data consequences;
- dependencies, work units, sequencing boundaries, focused verification, and completion criteria;
- review, adjudication, provenance, documentation, and closeout obligations when applicable;
- logging decision, if applicable, distinguishing permanent logs from temporary test output.

Use exact tool/action names from the current Pinot contract when the plan invokes them: `pinot_delegate_background`, `pinot_native_herdr_implementer`, and `pinot_run_test_suite`. Keep implementation state, history, and ledger locations configuration-driven through Pinot; never embed a machine path.

For controlled work, give an evidence-based intensity, exact review counts, approximate file/changed-line tripwires, current hazards, and a compact completion log. These are guardrails, not quotas. Stop and ask the user about unexpected persistence, runtime services, credential redesign, platform expansion, or material scope growth.

## Save

Do not implement. After the plan is ready, report its path, the user-visible result, verification expectations, rollback, and any unresolved technical or user-facing questions.
