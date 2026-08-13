# Security and privacy

Pinot is a Pi package. Pi packages run with the user's full system permissions; installing this package is equivalent to trusting its TypeScript extension. Read the source before installation and trust only projects where the package should operate.

## Current boundary

Work Units 0–1 provide only setup and status. Loading the extension registers commands and performs no file writes. `/pinot-status` reads only Pinot's state metadata and supported Pi location metadata. `/pinot-setup` is the only operation in this slice that creates Pinot state.

Setup writes only under `~/.pinot-pi`, or the absolute `PINOT_STATE_DIR` override. It preflights every target before writing, creates directories with exact owner-only mode `0700`, and creates template/config files with exact mode `0600`. Existing state is never overwritten. Symlinks, non-directories, unsafe permissions, ownership conflicts, and conflicting paths stop setup with an error before partial state creation.

Pinot does not read or copy Pi authentication, settings, session contents, or credentials. It does not install Pi, Node, Python, Herdr, a Herdr integration, or optional web capability. Status runs only the read-only `herdr integration status` probe, reports that integration independently from active `HERDR_ENV`, and checks configured models through Pi's registry without auth resolution.

Worker tool restrictions planned for later units will not be an operating-system filesystem sandbox. Project trust and Pi's full-permission package model remain relevant.

## Reporting a concern

Do not include credentials, tokens, private prompts, session contents, or personal paths in an issue. Describe the affected public path, reproduction, impact, and a safe synthetic example. For a suspected secret exposure, stop sharing the material and use a private channel appropriate to the repository owner.

## Rollback and uninstall

Pi package removal removes package code, not `~/.pinot-pi`. Pinot does not silently delete history, configuration, or ledger data. Archive or remove that state only as an explicit user action after reviewing its contents.
