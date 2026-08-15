---
description: Analyze workflow evidence, defects, effort, and representative outputs without making fixes
argument-hint: "<what to debrief>"
---
Debrief this coding work: $@

Do not implement fixes unless explicitly asked. This task is analysis only. Never copy transcripts, checkpoint bodies, credentials, sessions, caches, or generated diagnostic output into history.

## Evidence map

Begin with bounded exploration rather than reading every file or transcript. If the work can be matched to the configured `implementation-history` index, check that index first, select the matching record, and follow only its project, commit, session, checkpoint, snapshot, and output pointers. Treat records as maps, not proof; verify consequential claims directly in current code, Git, sessions, checkpoints, and outputs. Missing history, missing local usage evidence, and work performed before history initialization are normal fallback conditions, not evidence that no work occurred.

Map the repository architecture and current Git state, relevant commits and chronology, project-local session artifacts, named checkpoints, review reports, test artifacts, principal prompts/specifications/plans, and resulting outputs. Read project instructions and planning documents before drawing conclusions. Use bounded read-only delegation for useful seams, but inspect load-bearing evidence directly and do not broaden a history match into transcript archaeology without a reason.

## Analysis

Cover only supported conclusions about:

- the user request and interaction quality;
- architecture and implementation chronology;
- defects by discovery stage and the control most likely to prevent each;
- available model, effort, token, cost, duration, compaction, and tool-use evidence;
- representative outputs, product behavior, clarity, and untested claims;
- newly identified risks, marked fixed or unresolved; and
- concrete process recommendations and questions.

Treat delegated reports as leads. Do not infer quality or usage from absent data, and label judgments and uncertainty. Keep semantic implementation provenance separate from aggregate usage evidence; neither uniquely attributes counts, costs, models, or lifecycle totals to one implementation unless the evidence supports that claim. Do not expose sensitive values.

For each important defect or defect family, identify the missed requirement or invariant, why existing prompts/tests/reviews failed to prevent it, and the most likely prevention: clearer requirements, a shorter acceptance checklist, documentation, stronger fixtures/tests, independent review, real-input validation, or a different effort allocation. Do not count every correction as an escaped production bug.

Inspect a small number of consequential latent risks directly in code, especially around pagination, state transitions, retries, ambiguous side effects, activation, external protocols, and recovery. Inspect representative real outputs, not only tests and checkpoints. Use reproducible counts for quantitative claims and distinguish counterfactual judgments from facts. Do not read every transcript or dump high-volume artifacts.

## Deliverable

Produce a concise executive conclusion; architecture and chronology; prompt and interaction assessment; a defect table with discovery stage and likely prevention; model/effort/cost assessment when evidence exists; representative-output assessment; fixed and unresolved risks; process changes; and questions for the user.

Save detailed analysis only under an ignored project-local diagnostic location when the project convention permits it. Keep temporary diagnostic output distinct from permanent application logs. Report the path, evidence limitations, unresolved high-risk findings, and next questions. Do not modify tracked project files unless explicitly asked.
