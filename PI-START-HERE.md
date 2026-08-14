# Pinot onboarding for your Pi agent

You are the user’s existing Pi agent. Pinot is optional package of prompts and tooling. It does not replace the user’s agents, instructions, extensions, settings, or available models. Treat Pinot as an addition that must coexist with the current setup.

## Bounded read-only review

Inspect before changing anything. Use only tools and commands currently visible in this session, `pi list`, and bounded reads of relevant user/project package settings, manifests, and extension sources. Do not open or run the interactive `pi config` view during this read-only review. Inspect only as needed:

- global package/settings sources under `~/.pi/agent/`;
- project package/settings sources under `.pi/`, only when the project is trusted;
- installed package manifests and extension, prompt, or skill sources only when needed to identify a collision or overlap.

Respect Pi’s project-trust decision. Do not bypass it or load project-local resources merely to inspect them. Never read authentication files, secrets, API keys, session JSONL, or session contents. Do not print sensitive settings values. Do not infer extension provenance that the current runtime visibility, `pi list`, package manifest, or source inspection does not actually show.

## Resource presence and exact collision check

First record a Pass when each expected Pinot resource is present under its package-owned name and resolves to Pinot. Package-owned presence alone is not a collision. Call it an exact collision only when the same name also has another visible origin, a suffixed duplicate appears, or the expected name resolves away from Pinot.

Check the current visible commands, tools, prompt names, and skills for these Pinot resources:

- tools: `pinot_delegate_background`, `pinot_native_herdr_implementer`, `pinot_run_test_suite`;
- commands: `/pinot-setup`, `/pinot-status`;
- prompts: `/pinot-spec`, `/pinot-plan`, `/pinot-implement`, `/pinot-debug`, `/pinot-debrief`, `/pinot-janitor`;
- skill: `pinot-janitor` (normally available as `/skill:pinot-janitor` when skill commands are enabled).

Report package-owned presence as Pass. Report each exact collision with its visible source and scope. An exact duplicate extension tool name is load-order-sensitive: do not assume both implementations will be available independently. Do not disable anything yourself.

## Functional overlap is not a conflict

Separately look for likely functional overlap, without calling it a conflict:

- subagent or background-delegation tools;
- durable-agent or Herdr integrations;
- plan, debug, Debrief, or Janitor workflows;
- test-runner tools.

For each possible overlap, report the evidence source and scope (for example, visible current tool, package listed by `pi list`, project resource, or inspected source) and the practical consequence. Distinguish an overlapping purpose from an exact name collision. If evidence is insufficient, say so.

Never disable, remove, or edit settings or resources without explicit user approval. If filtering is needed, recommend that the user open `pi config` after this report and, where appropriate, use package filtering rather than changing unrelated settings.

## Pinot state and model mapping

Inspect Pinot’s user-owned state without exposing values unnecessarily. If `~/.pinot-pi` (or the user’s explicit `PINOT_STATE_DIR`) is absent, tell the user to run `/pinot-setup`; do not run setup automatically. If `config.json` exists, read its mapping values locally as needed to identify empty or invalid mappings, but do not echo them unnecessarily, inspect authentication, or rewrite the file.

After the user approves, help map only the roles and implementer efforts they want to use to models already available in this Pi. The supported generic form is `<provider>/<model>:<thinking>`. Do not invent providers, model IDs, thinking levels, or defaults. Leave unspecified roles and `standard`/`maximum` efforts unchanged or empty. Leave `externalSourceExtension` blank unless the user explicitly has and wants to configure a compatible external-source extension. Get approval before editing `~/.pinot-pi/config.json`.

## Herdr, only for dependent workflows

Herdr is separately installed and configured by the user. It is required for `/pinot-implement`, any `/pinot-janitor` run, and a production fix routed from `/pinot-debug`. `/pinot-spec`, `/pinot-plan`, `/pinot-debrief`, and the diagnosis phase of `/pinot-debug` do not require Herdr. Only if the user wants a dependent workflow, perform read-only Herdr checks such as version and integration/status queries. Do not install Herdr, change its configuration, or claim it is ready when a check is unavailable.

## What Pinot provides

- `/pinot-spec` explores an idea and reports a specification path.
- `/pinot-plan` turns the supplied brief or specification into a standalone plan. Give it the specification path when that is the settled source.
- `/pinot-implement <plan-path>` coordinates durable writing from the exact plan path; it requires the Herdr-backed implementer and the user’s configured implementer effort.
- `/pinot-debug <symptom>` diagnoses first without requiring Herdr; any approved production fix is routed through the durable Herdr implementer.
- `/pinot-debrief <subject>` reviews implementation evidence, starting with the user-owned semantic history when present.
- `/pinot-janitor <closeout|docs|sweep> [scope]` performs the selected bounded Janitor work; closeout uses the exact handoff and supplied history path.

The three tools are bounded background delegation, durable Herdr implementation, and exact test-suite execution. Explain any missing prerequisite plainly. Do not create a new workflow or substitute a parent edit for a required durable writer.

## Finish and stop

End with exactly these headings:

### Pass
What was checked and found compatible.

### Warning
Exact collisions, uncertain provenance, functional overlap, unavailable checks, or trust limitations.

### Action Needed
A short ordered list of exact next steps, such as asking the user to review filtering in `pi config` after this report, running `/pinot-setup`, approving selected model mappings, or separately configuring Herdr. If no action is needed, say `None`.

Stop after this report. Do not edit settings, install anything, run setup, invoke Pinot workflows, start agents, or launch a session as part of this onboarding review.
