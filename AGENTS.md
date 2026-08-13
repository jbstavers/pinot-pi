# Agent guidance

Pinot is an independent Pi coding-agent workflow package. Keep package code, templates, and tests public-safe and independent from any private configuration or repository.

- Mutable user state belongs outside the checkout, under `~/.pinot-pi` by default. The only Pinot state-root override is `PINOT_STATE_DIR`.
- Loading `extensions/pinot.ts` must not write files or inspect credentials, settings, or session contents. Writes occur only through explicit `/pinot-setup`.
- Use exact built-in inspection commands for load-bearing checks. Optional RTK use is reconnaissance only; never run `rtk init` or use an automatic rewrite hook.
- Run focused tests with `npm test` and type checks with `npm run typecheck`. Keep noisy diagnostic output under ignored `+test-output/`.
- Do not commit or add a remote unless the repository owner explicitly asks.
