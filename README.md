# Pinot

Pinot is a set of tools for the Pi coding agent (https://pi.dev) that give Pi a development infrastructure for personal coding projects. It was developed to be consistent with the general Pi philosophy — it does not impose a workflow on the user, it can be easily customized, and it provides core functionality rather than a feature-rich application. 

It adds six prompts, one skill, three tools, and small user-owned state/configuration plumbing. It does not replace the user’s Pi installation, agents, settings, or configuration; its namespaced resources coexist with them.

Pinot gives Pi two kinds of subagents: one-shot, background subagents for targeted tasks and an “implementer” subagent that runs in a persistent, reviewable Pi sessions for longer running, complex tasks. 

The durable, long-running subagents are configured to use Herdr, a multi-session terminal tool built for agentic coding: https://herdr.dev/. If you’d prefer not to use Herdr, ask your Pi to modify this to work with tmux or any other multi-session tool. Or you can use the background subagents and disable the implementer in favor of having your primary Pi agent handle implementation. 

The saved prompts are based on a straightforward planning workflow, and anticipate the use of Pinot’s subagents. As written, they are tuned for a feature development in an existing codebases or the development of apps. They can be easily modified to fit other contexts. 

Pinot works well with Pi’s native compaction, or with tools like observational-memory. Note that subagents spawn without extensions, so they use Pi-native compaction (they also report their context status to the parent agent, which tries to avoid overstuffing their context).

Pinot is intended to be installed and managed by your Pi. As described below in the installation instructions, the file `PI-START-HERE.md` introduces Pinot to your Pi and helps you complete setup.

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

In Pi, run `/pinot-setup`. Then either edit `~/.pinot-pi/config.json` yourself or ask your own Pi agent to help map Pinot roles and implementer efforts to models already available in your Pi. Mappings use only the generic form `<provider>/<model>:<thinking>`; Pinot supplies no model or provider defaults.

The saved prompts will use whatever model you have active in your current Pi session, and for most work, this should be a highly capable model on medium to high effort settings. Very high (“xhigh” “max”) can sometimes produce verbose outputs and scope creep. 

The subagents can use smaller, cheaper models. Pinot was developed primarily with the GPT 5.6 family, with the following model assignments.

| Role | Model |
   |---|---|
   | scout | `gpt-5.6-luna:low` |
   | assessor | `gpt-5.6-luna:high` |
   | reviewer | `ogpt-5.6-luna:high` |
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

## What is included

- Six generic prompt templates and the package-owned `pinot-janitor` skill.
- `pinot_delegate_background` for one-shot, bounded read-only subagents in five roles: `scout`, `assessor`, `second-opinion`, `reviewer`, and `verifier`. Each role maps to a model already available in the user’s Pi; Pinot supplies no defaults. External-source scouting requires a compatible user-provided extension.
- `pinot_native_herdr_implementer` for durable Herdr-backed writing.
- `pinot_run_test_suite` for one bounded executable-and-argument test run.
- `/pinot-setup` and `/pinot-status` for the minimal Pinot state/configuration boundary.
- User-owned semantic implementation-history templates for Janitor closeout and Debrief lookup. This records implementation provenance, not subagent usage.

The prompts and skill are resources for the user’s existing Pi workflow. A short architecture and workflow reference is in [`docs/architecture.md`](docs/architecture.md) and [`docs/workflows.md`](docs/workflows.md). Security boundaries are documented in [`SECURITY.md`](SECURITY.md).

Licensed under the [MIT License](LICENSE).
