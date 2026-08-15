---
description: Turn a brief into an evidence-grounded executor-ready plan
argument-hint: "<brief>"
---
Use the following as the initial product brief: $@

Turn the brief into a strong, standalone implementation plan through focused dialogue with the user and grounding in the actual project. Make the product and technical work clear before adding execution controls.

## Planning posture

Prefer the smallest coherent change. Reuse existing architecture, tools, validation, and recovery paths. Backups, migrations, repair paths, compatibility layers, generalized validators, integrity scans, new harnesses, speculative fallbacks, malformed-state validation, concurrency defenses, and future abstractions need concrete project evidence or a user/data consequence; otherwise exclude them. Treat out-of-posture findings as report-only until approved.

Use current configuration and authoritative documentation for system boundaries. Verify load-bearing integration requirements in the operating context, trace trigger to user outcome and failure behavior, and do not silently add obligations or degraded experiences. Do not invent commands, dependencies, fixtures, prerequisites, conventions, fallbacks, or named model/provider choices. Delegate only bounded read-only mapping or consequential plan assessment when its evidence is worth the overhead.

Ask only questions whose answers could change outcome, operating context, user experience, data boundary, or scope. Before saving, play back goal, done, scope, decisions, and exclusions for confirmation. Controlled planning is the default. A lightweight plan is eligible only for low-risk, low-complexity work in one bounded subsystem, with one or two reversible slices, no user-data, storage, migration, security, live-state, broad protocol/API/build, or new-infrastructure implications. If eligible, ask whether the user approves lightweight planning; if not approved or no decision is given, use controlled planning.

## Standalone plan

Save at the established planning location or `docs/+plans/<slug>-plan.md`. A fresh `/pinot-implement` run must execute it without this conversation. Include only what the work earns:

- **Risk posture:** intolerable user outcomes and data consequences, explicitly declined hardening, and report-only findings.
- **Goal and end state:** user-visible result, operating conditions, unchanged important behavior, locked choices, and rationale.
- **Scope and grounding:** exclusions plus exact paths for instructions, decisions, source, tests, fixtures, commands, documentation, and prerequisites. Record evidence and user-visible implications for consequential system boundaries.
- **Work units:** dependencies, likely files, focused verification, sequencing boundaries, and a natural checkpoint only when earned.
- **Verification and safety:** exact existing commands, focused and final checks, high-risk cases, unavailable checks, rollback, data consequences, documentation, backup, and migration obligations; say when none is warranted.
- **Completion:** mechanically checkable acceptance criteria and concise rejected approaches.

Include a concise application-logging decision when the project has a meaningful failure boundary: identify high-value, low-noise lifecycle or external-boundary failures, privacy boundary, local text-log location, existing or standard logger, configuration, retention/rotation, debug enablement, and verification. Never plan to log credentials, tokens, resolved secrets, raw requests/responses, or private user content. Distinguish permanent application logs from temporary test output.

Use exact Pinot tool names only when the plan needs them: `pinot_delegate_background`, `pinot_native_herdr_implementer`, and `pinot_run_test_suite`. Keep Pinot state and history locations configuration-driven. Do not restate generic implementation lifecycle, writer, checkpoint, pane, context, or recovery rules unless this work earns a project-specific seam.

A controlled plan may add conditional **Assignment seams** only when multiple units make child continuity or a fresh-child boundary consequential; record the project-specific routing facts and why. It may add **execution routing** only when an exceptional independent review or higher-capability assignment earns explicit treatment; state the reason, capability target, and whether it replaces ordinary review. Do not name private models or tools, and do not restate generic lifecycle mechanics.

## Controlled diagnostics

For controlled work, state intensity and its evidence-based rationale. Give exact integer budgets for focused implementer sessions, ordinary `reviewer` passes, and `second-opinion` passes; use zero when none is planned. Give approximate file scale and changed-line scale, where changed lines means Git insertions plus deletions. These are tripwires, not quotas or delivery estimates. Name phases only at real dependency or verification boundaries.

At each gate compare actual Git scope, checks, hazards, and review counts with the plan budget; prune hazards and replan if needed. Stop for approval on an unexpected subsystem, unexpected persistence or runtime service, credential or data-boundary redesign, platform expansion, invalidated decision, persistence or migration boundary, risk-posture breach, or material scope or budget growth—not ordinary small variance. Honor exact declared review counts and seams. Include a compact Current hazards list and Unit Completion Log for controlled work. Leave child-report mechanics to `/pinot-implement`.

Before saving, verify every named path, fixture, command, prerequisite, system claim, and declared review count against the repository. If something is unavailable, say so and stop or record the blocker; never fill the gap. Do not implement. After saving, report the path, user-visible result, verification expectations, rollback, and unresolved questions.
