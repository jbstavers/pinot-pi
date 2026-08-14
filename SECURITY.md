# Security and privacy

Pinot is a Pi package. Pi packages run with the user's full system permissions; installing this package is equivalent to trusting its TypeScript extension. Read the source before installation and trust only projects where the package should operate.

## Current boundary

Work Units 0–2 provide setup, status, and bounded background delegation. Loading the extension registers commands/tools and performs no file writes. `/pinot-status` reads only Pinot's state metadata and supported Pi location metadata. `/pinot-setup` is the only parent operation that creates persistent Pinot state.

Setup writes only under `~/.pinot-pi`, or the absolute `PINOT_STATE_DIR` override. It preflights every target before writing, creates directories with exact owner-only mode `0700`, and creates template/config files with exact mode `0600`. Existing state is never overwritten. Symlinks, non-directories, unsafe permissions, ownership conflicts, and conflicting paths stop setup with an error before partial state creation.

Pinot does not copy Pi authentication, settings, session contents, or credentials. Delegation resolves only the selected provider through Pi's documented `ctx.modelRegistry.getProviderAuth(provider)` boundary. It writes one mode-0600 temporary bridge, passes only its path to the package-owned child bootstrap, and removes the bridge/workspace on success, failure, timeout, and cancellation. The child consumes and unlinks the bridge before registering the built-in provider with resolved API key, headers, and base URL; provider-scoped environment values are applied only in the child process. No token or bridge path is placed in argv, results, logs, or persistent state, and the parent never falls back to a full user auth/settings file.

Workers receive only read-only `read`, `grep`, `find`, and `ls` tools. Their paths are checked against the canonical project root and symlink escapes are rejected. This is a process/configuration boundary, not an OS sandbox: Pi packages still run with full user permissions. External-source scouting is rejected unless `externalSourceExtension` explicitly names a compatible user-provided extension; Pinot bundles neither web access nor RTK. Status runs only the read-only `herdr integration status` probe, reports that integration independently from active `HERDR_ENV`, and checks configured models through Pi's registry without auth resolution.


## Reporting a concern

Do not include credentials, tokens, private prompts, session contents, or personal paths in an issue. Describe the affected public path, reproduction, impact, and a safe synthetic example. For a suspected secret exposure, stop sharing the material and use a private channel appropriate to the repository owner.

## Rollback and uninstall

Pi package removal removes package code, not `~/.pinot-pi`. Pinot does not silently delete history, configuration, or ledger data. Archive or remove that state only as an explicit user action after reviewing its contents.
