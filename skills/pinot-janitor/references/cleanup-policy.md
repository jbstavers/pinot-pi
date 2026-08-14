# Pinot cleanup policy

Classify every candidate as:

- **delete:** all high-confidence criteria are met and deletion is reported;
- **retain:** evidence shows it is needed, active, human-created, tracked, outside scope, or safer to keep;
- **unresolved:** ownership, purpose, provenance, active use, or consequences remain uncertain. Retain it.

Delete only understood, reproducible or disposable output inside the assigned project, ignored or clearly ephemeral, inactive, owner-safe, and not needed for review or recovery. A name, age, size, ignore rule, or convenience alone is not authority.

Never delete tracked source/tests or documentation, active work, uncertain human input, credentials, authentication state, application data, Pi sessions, checkpoints, caches, backups, application logs, or anything outside the project and exact supplied history-root exception. Do not clean another writer’s files. If a criterion is unclear, retain and report it.
