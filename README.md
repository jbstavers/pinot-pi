# Pinot

`@jbstavers/pinot-pi` is a reusable extraction from a working Pi coding-agent setup. It adds namespaced prompts, one skill, three tools, and small user-owned state/configuration plumbing. It does not replace the user’s Pi installation, agents, settings, or configuration; its namespaced resources coexist with them.

Pinot is unrelated to Apache Pinot, the data platform.

> **Trust warning:** Pi packages run with the user’s permissions. Review the package source and Git ref before installing it.

After installing, ask your own Pi agent to locate and read [`PI-START-HERE.md`](PI-START-HERE.md), then follow its bounded onboarding instructions. It is a root agent guide, not another prompt or command.

## Install and use

Install a reviewed Git ref with Pi:

```text
pi install git:<host>/<repository>@<reviewed-tag>
```

For a temporary current-run trial, use:

```text
pi -e git:<host>/<repository>@<tag>
```

`-e` loads that package for the current Pi run; it is not a persistent installation.

In Pi, run `/pinot-setup`. Then either edit `~/.pinot-pi/config.json` yourself or ask your own Pi agent to help map Pinot roles and implementer efforts to models already available in your Pi. Mappings use only the generic form `<provider>/<model>:<thinking>`; Pinot supplies no model or provider defaults. Run `/pinot-status`, then use the prompts:

- `/pinot-spec`
- `/pinot-plan`
- `/pinot-implement`
- `/pinot-debug`
- `/pinot-debrief`
- `/pinot-janitor`

The default state root is `~/.pinot-pi`; `PINOT_STATE_DIR` may set an absolute alternative. Setup is explicit, idempotent, and non-overwriting. It creates only Pinot’s config, implementer session/checkpoint directories, and semantic implementation-history templates. It does not edit Pi settings, authentication, agents, or existing sessions.

Herdr is installed and configured separately. It is required for `/pinot-implement`, any `/pinot-janitor` run, and production fixes routed from `/pinot-debug`. `/pinot-spec`, `/pinot-plan`, `/pinot-debrief`, and `/pinot-debug` diagnosis do not require it; Pinot does not install Herdr. The package has been tested on macOS. Other operating systems are unverified.

## What is included

- Six generic prompt templates and the package-owned `pinot-janitor` skill.
- `pinot_delegate_background` for bounded read-only work.
- `pinot_native_herdr_implementer` for durable Herdr-backed writing.
- `pinot_run_test_suite` for one bounded executable-and-argument test run.
- `/pinot-setup` and `/pinot-status` for the minimal Pinot state/configuration boundary.

The prompts and skill are resources for the user’s existing Pi workflow. A short architecture and workflow reference is in [`docs/architecture.md`](docs/architecture.md) and [`docs/workflows.md`](docs/workflows.md). Security boundaries are documented in [`SECURITY.md`](SECURITY.md).

## Development

```bash
npm install
npm test
npm run typecheck
npm run package:dry-run
```

Tests use synthetic data and isolated temporary homes. AI assistance contributed to this package; the design and resulting changes remain subject to human direction and review.

Licensed under the [MIT License](LICENSE).
