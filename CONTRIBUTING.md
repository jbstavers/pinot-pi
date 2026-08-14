# Contributing

Keep Pinot independent, public-safe, and small. It is an extraction for an existing Pi setup, not a replacement for Pi configuration or agents.

## Before a change

1. Read `README.md`, `SECURITY.md`, and the relevant `docs/` reference.
2. Keep private configuration, personal paths, credentials, session contents, and provider/model defaults out of source and tests.
3. Use synthetic data and isolated temporary homes in tests.
4. Preserve the six namespaced prompts, Janitor skill, three named tools, and explicit setup/status boundary. Do not add unrelated commands, workflows, or abstractions.

## Verification

```bash
npm install
npm test
npm run typecheck
npm run package:dry-run
```

Keep noisy diagnostic output in ignored `+test-output/` files. Do not add generated state, credentials, caches, or session files. Do not commit or publish from a task unless the repository owner explicitly requests it.
