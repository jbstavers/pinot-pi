# Contributing

Contributions should preserve Pinot's independence, small scope, and explicit state boundary.

## Before a change

1. Read `README.md`, `SECURITY.md`, and `docs/architecture.md`.
2. Confirm the change does not depend on private configuration, personal paths, credentials, session content, or provider/model defaults.
3. Keep mutable state outside the checkout and use synthetic isolated homes in tests.

## Verification

```bash
npm install
npm test
npm run typecheck
npm run package:dry-run
```

Add focused tests for behavior and failure semantics. Do not add generated state, credentials, package-manager caches, or session files. Keep full diagnostic output in ignored `+test-output/` when needed.

## Scope

The current slice does not include workflow prompts, background delegation, durable implementation, Herdr lifecycle integration, ledger scanning, or release automation. Propose those as separate, reviewable work rather than adding hidden fallbacks.
