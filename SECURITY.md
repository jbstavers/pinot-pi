# Security and privacy

Pinot is a Pi package. Pi packages run with the user’s full system permissions, so installation grants this extension the same access as the Pi process. Review the source before installation.

## Boundaries

Loading `extensions/pinot.ts` only registers `/pinot-setup`, `/pinot-status`, and the three named tools. It does not write files or inspect credentials, settings, or session contents. `/pinot-setup` is the only setup write path. It creates owner-only `~/.pinot-pi` state (or the absolute `PINOT_STATE_DIR` override), refuses unsafe ownership, permissions, symlinks, and conflicts, and never overwrites existing files.

The setup-created state contains `config.json`, implementer sessions and checkpoints, and `implementation-history` templates. Pinot’s package resources are separate from user Pi state and may be replaced when the package is updated. Pinot does not replace Pi configuration, agents, authentication, or existing sessions.

Configuration mappings are user-supplied `provider/model:thinking` references. Status checks them against Pi’s model registry without resolving credentials. Status checks Herdr availability and integration without installing it; Herdr is separately installed and configured. `/pinot-implement`, every `/pinot-janitor` run, and production fixes routed from `/pinot-debug` require the active Herdr environment and matching project attachment. Spec, plan, Debrief, and debug diagnosis do not require Herdr. They refuse rather than edit from the parent when Herdr is unavailable.

`pinot_delegate_background` runs one bounded, read-only child with only `read`, `grep`, `find`, and `ls`. It uses the selected provider’s Pi auth boundary and a temporary owner-only bridge, never copies full auth/settings files, and removes temporary material after each outcome. Its canonical-root and symlink checks are process/configuration boundaries, not an operating-system sandbox. `pinot_run_test_suite` accepts one executable plus literal arguments, rejects shell syntax, bounds execution, and keeps complete combined output in an owner-only diagnostic log under an ignored `+test-output/` directory or an explicitly supplied Pinot state-root directory.

No permanent application log, logger configuration, or debug mode is provided. Test-suite logs and other diagnostic output are temporary and should be removed explicitly when no longer needed. Pinot does not retain credentials, tokens, raw requests, session contents, or private user material in package resources or persistent metadata.

## Workflow and history boundary

The six prompts and Janitor skill are explicit package resources. They do not alter personal Pi UI settings or assume a named model. Implementation-history records are user-owned semantic records for Debrief and Janitor: they may preserve provenance, verification, review, deviations, remaining work, and safe snapshot pointers. They must not contain transcripts, checkpoint bodies, credentials, authentication state, sessions, caches, generated diagnostic output, or uncertain inputs.

## Reporting a concern

Do not include credentials, tokens, private prompts, session contents, or personal paths in an issue. Use a synthetic example and describe the affected public path, reproduction, and impact.

## Rollback and removal

Removing the Pi package removes package code, not `~/.pinot-pi`. Review and remove that user-owned state separately if desired; Pinot does not silently delete it.
