# Pinot repository documentation policy

Keep `README.md` useful to a cold reader: purpose, setup, ordinary commands, structure, and ownership boundaries. Keep `AGENTS.md` concise and agent-facing: authoritative context, conventions, validation, scope limits, and durable pointers. Use `docs/` for durable architecture, workflows, decisions, and recovery guidance.

Record only behavior supported by current implementation, tests, configuration, and observed evidence. Distinguish project conventions from one-time decisions. If documentation conflicts with behavior, report the defect to the source writer rather than changing product behavior.

During closeout or docs review, document permanent application logging when it exists: predictable log location, retention/rotation and cleanup, configuration path/settings/defaults, optional debug enablement, lifecycle events, and privacy boundary. Distinguish permanent application logs/config from temporary diagnostic/test logs; never delete application logs as cleanup.

For `/pinot-debrief`, preserve history-first lookup: the index points to a selected record, and the record points to project, commits, safe specification/plan snapshots, semantic provenance, review/verification, deviations, remaining work, Janitor maintenance, and Debrief lookup pointers. Missing history is a bounded fallback, not proof of absence.
