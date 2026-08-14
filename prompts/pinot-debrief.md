---
description: Analyze workflow evidence, defects, effort, and representative outputs without making fixes
argument-hint: "<what to debrief>"
---
Debrief this Pi coding work: $@

Do not implement fixes unless explicitly asked. Start with bounded exploration. Use Pinot’s configured implementation-history index first, select the matching record, and follow only its project, commit, session, snapshot, and output pointers. Treat records as maps, then verify consequential claims in current code, Git, sessions, checkpoints, and outputs. Missing history and work performed before history initialization are normal bounded fallbacks—not evidence that no work occurred.

Never copy transcripts, checkpoint bodies, credentials, sessions, caches, or generated diagnostic output into history.

## Evidence map

Bound the map to the repository architecture and current Git state, relevant commits, project-local Pi artifacts, named checkpoints, review reports, test artifacts, and the supplied prompts/specifications/plans. Read project instructions and planning documents before conclusions. Follow history pointers before any transcript fallback. Use read-only delegation only for bounded seams; inspect load-bearing evidence directly.

## Analysis

Cover only supported conclusions about:

- the user request and interaction quality;
- architecture and implementation chronology;
- defects by discovery stage and the control most likely to prevent each;
- model, reasoning-effort, token, cost, duration, compaction, and tool-use evidence when actually available;
- representative outputs, product behavior, clarity, and untested claims;
- newly identified risks, marked fixed or unresolved; and
- concrete process recommendations and questions for the user.

Do not infer model quality from absence of data. Label judgments and uncertainty. Do not read every transcript or dump high-volume artifacts; use bounded indexes, ranges, summaries, and reproducible counts. Do not expose sensitive values in the report.

Save detailed analysis under an ignored project-local diagnostic directory such as `+test-output/debrief/` only when the user’s project convention permits it. Keep temporary diagnostic output distinct from permanent application logs. Report the path, evidence limitations, unresolved high-risk findings, and next questions. Do not modify tracked project files.
