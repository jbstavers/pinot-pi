# Pinot

Pinot is a set of tools for the Pi coding agent (https://pi.dev) that give Pi a development infrastructure for personal coding projects. It was developed to be consistent with the general Pi philosophy — it does not impose a workflow on the user, it can be easily customized, and it provides core functionality rather than a feature-rich application. 

It adds three tools, one skill, six prompts, and small user-owned state/configuration plumbing. It does not replace the user’s Pi installation, agents, settings, or configuration; its namespaced resources coexist with them.

Pinot gives Pi two kinds of subagents: one-shot, background subagents for targeted tasks and an “implementer” subagent that runs in a persistent, reviewable Pi sessions for longer running, complex tasks. 

The background subagents are simple tools, they accept guidance from the parent agent, which is combined with a prompt for their specific role, they do their thing, and they report back to the parent agent. The user typically won't call them directly. Their model selection and role prompt can be easily modified to fit other uses. 

The durable, long-running subagents are configured to use Herdr, a multi-session terminal tool built for agentic coding: https://herdr.dev/. If you’d prefer not to use Herdr, ask your Pi to modify this to work with tmux or any other multi-session tool. Or you can use the background subagents and disable the implementer in favor of having your primary Pi agent handle implementation. 

The Janitor skill is called automatically at the completion of implementation, and can be called by the user any time. It addresses two common weaknesses of coding agents: they leave behind test outputs and other detritus, and they don't keep documentation up to date. 

The saved prompts are based on a straightforward planning workflow, and anticipate the use of Pinot’s subagents. As written, they are tuned for a feature development in an existing codebases or the development of apps. Their names are self-explanatory. They can be easily modified to fit other contexts. 

Pinot works well with Pi’s native compaction, and also with observational-memory. Other advanced compaction tools should generally work as well. Note that subagents spawn without extensions, so they use Pi-native compaction (they report their context status to the parent agent, which tries to avoid overstuffing their context).

If you are using Pinot as part of a new Pi configuration, it benefits from a question asking tool, of which there are many (or have Pi build you one) and a web search tool, for example the popular pi-web-access. 

Pinot is intended to be installed and managed by your Pi. As described below in the installation instructions, the file `PI-START-HERE.md` introduces Pinot to your Pi and helps you complete setup.

## Install and use

Install a reviewed Git ref with Pi:

```text
pi install git:github.com/jbstavers/pinot-pi@v1.0.0
```

For a temporary current-run trial, use:

```text
pi -e git:github.com/jbstavers/pinot-pi@v1.0.0
```

`-e` loads that package for the current Pi run; it is not a persistent installation.

In Pi, run `/pinot-setup`. Then either edit `~/.pinot-pi/config.json` yourself or ask your own Pi agent to help map Pinot roles and implementer efforts to models already available in your Pi. Mappings use only the generic form `<provider>/<model>:<thinking>`; Pinot supplies no model or provider defaults.

The saved prompts will use whatever model you have active in your current Pi session, and for most work, this should be a highly capable model on medium to high effort settings. Very high (“xhigh” “max”) can sometimes produce verbose outputs and scope creep. 

The subagents can use smaller, cheaper models. Pinot was developed primarily with the GPT 5.6 family, with the following model assignments.

| Role | Model |
   |---|---|
   | scout | `gpt-5.6-luna:low` |
   | assessor | `gpt-5.6-luna:high` |
   | reviewer | `gpt-5.6-luna:high` |
   | verifier | `gpt-5.6-luna:low` |
   | second-opinion | `kimi-k3:high` |
   | implementer | `gpt-5.6-luna:high` |

Even smaller, locally usable models should be sufficient for the background subagents tasks. Users interested in using a smaller model for the implementer model (which runs in the persistent Pi session and does the heavy lifting), can modify the /plan and /implement prompts to require more narrowly defined implementation slices and subagent assignments.

The `second-opinion` tool is designed to be configured with a model from a different company than your default model. For example, if you use an OpenAI model to run /plan and /implement, ideally configure `second-opinion` with a model from another company. As of this writing, Kimi K3 is a strong choice for this role if that’s not your regular model.

Run `/pinot-status`, then use the prompts:

- `/pinot-spec`
- `/pinot-plan`
- `/pinot-implement`
- `/pinot-debug`
- `/pinot-debrief`
- `/pinot-janitor`

Herdr is installed and configured separately. It is required for `/pinot-implement`, any `/pinot-janitor` run, and production fixes routed from `/pinot-debug`. `/pinot-spec`, `/pinot-plan`, `/pinot-debrief`, and `/pinot-debug` diagnosis do not require it; Pinot does not install Herdr.

After installing, ask your own Pi agent to locate and read [`PI-START-HERE.md`](PI-START-HERE.md), then follow its onboarding instructions.

The package has been tested on macOS. Other operating systems are unverified.

## Optional `AGENTS.md` guidance

Pinot's prompts, tool descriptions, and Janitor skill carry their own operating instructions, so no additional agent guidance is required. Users who want their ordinary Pi agent to follow the same coordination posture outside the saved prompts can adapt this short policy in their global or project `AGENTS.md`:

```markdown
## Pinot workflow

For nontrivial work that the user did not explicitly request, state the
assumed intent and proposed next action before proceeding. Ask for confirmation
when a decision affects product behavior, scope, data, permissions, or a
hard-to-reverse action.

Use delegation only when it provides more value than its coordination cost:

- Use `pinot_delegate_background` for bounded, read-only research, assessment,
  review, or verification.
- Use one `pinot_native_herdr_implementer` for approved production writing.
  Keep the parent agent as coordinator and reviewer while the implementer owns
  the edits.
- Never silently fall back to parent-agent editing when a Pinot workflow
  requires the durable implementer.
- Treat a child checkpoint as a handoff, not proof. Inspect the resulting
  changes and verify consequential claims directly.
- Run focused tests during implementation. Use `pinot_run_test_suite` for the
  final full-suite pass after review.

Keep assignments narrow, preserve uncertain files, and do not install,
configure, commit, push, publish, or perform destructive actions without the
user's applicable approval.
```

Keep this policy brief and adapt it to local preferences. Model mappings belong in `~/.pinot-pi/config.json`; personal paths, provider assumptions, and detailed lifecycle rules do not need to be copied into `AGENTS.md`. Pinot's repository-level `AGENTS.md` is maintainer guidance for developing Pinot itself, not a template for adopters.

## What is included

- Six generic prompt templates and the package-owned `pinot-janitor` skill.
- `pinot_delegate_background` for one-shot, bounded read-only subagents in five roles: `scout`, `assessor`, `second-opinion`, `reviewer`, and `verifier`. Each role maps to a model already available in the user’s Pi; Pinot supplies no defaults. External-source scouting requires a compatible user-provided extension.
- `pinot_native_herdr_implementer` for durable Herdr-backed writing.
- `pinot_run_test_suite` for one bounded executable-and-argument test run.
- `/pinot-setup` and `/pinot-status` for the minimal Pinot state/configuration boundary.
- User-owned semantic implementation-history templates for Janitor closeout and Debrief lookup. This records implementation provenance, not subagent usage.

The prompts and skill are resources for the user’s existing Pi workflow. A short architecture and workflow reference is in [`docs/architecture.md`](docs/architecture.md) and [`docs/workflows.md`](docs/workflows.md). Security boundaries are documented in [`SECURITY.md`](SECURITY.md).

Licensed under the [MIT License](LICENSE).
