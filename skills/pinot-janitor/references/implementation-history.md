# Pinot implementation-history contract

The configured Pinot history root is the only second-repository authority Janitor may receive. It must be supplied as an exact path by the coordinator; do not discover or broaden it.

Each implementation is a dated directory containing `record.md`, an optional exact `specification.md`, `plan.md` for the primary plan, and one `plan-<slug>.md` per additional supplied plan. Check the intended directory, index line, and snapshot filenames first. Stop on collision or ambiguity. Never overwrite an existing entry or invent a suffix.

`record.md` is semantic provenance, not a usage ledger. It records outcome, project and commit range, root session identity, durable-child identity and final host state, bounded background purposes/dispositions, review findings/dispositions, verification, deviations, remaining work, exact snapshot pointers, Janitor maintenance, and Debrief lookup pointers.

Copy only exact safe regular specification/plan files supplied by the coordinator. Apply lowercase ASCII deterministic slugs to additional plan labels. Never concatenate plans. Do not copy transcripts, checkpoint bodies, credentials, authentication state, sessions, caches, generated reports, or uncertain inputs.

An aggregate ledger report path and exact coverage end are optional period references. They are not per-implementation attribution and must not be expanded with metrics. The coordinator fills them only after successful durable close and a later scanner run. Missing ledger integration is reported honestly.
