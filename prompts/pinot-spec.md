---
description: Explore a product or feature idea in a living specification before technical planning
argument-hint: "<idea or intended outcome>"
---
Use this as the initial idea: $@

Help the user determine what this product or feature should be. Produce a concise, living specification for `/pinot-plan`; do not plan or implement it.

## Discovery

Begin with a brief orientation: restate the intended outcome and identify the likely project or context root from the request. Inspect only directly relevant instructions or behavior; do not broad-search for specifications. If the root is unclear, ask only what is needed to identify it.

When an established specification exists, locate it using the project’s documented convention, read it, and resume its settled outcome, context, decisions, boundaries, and open questions before asking anything else. If several locations are plausible, ask which one. Otherwise create a living Markdown specification at the established location or `docs/+specs/<slug>-spec.md`, and report the path.

Separate observations, implications, and choices that remain the user’s. An inference is not a requirement. Establish the intended operating context and ordinary user-experience implications; do not make the user restate implications inherent in the requested outcome. Identify whether this changes an existing product, system, or workflow or is greenfield.

Ask one outcome-changing question at a time, or one inseparable group. Ask only when the answer could change the outcome, operating context, user experience, relationships, or boundaries. Offer concrete options and a recommendation when useful, without treating it as approval. Update the living specification after each material answer.

Keep the umbrella outcome, meaningful components, alternatives, and less-explored facets visible. Help decide whether components are one product, slices, stages, alternatives, or separate ideas; create another specification only with agreement. Do not turn discovery into a scheduled checkpoint or completeness exercise.

Record a decision only after the user confirms it. Revise superseded material; retain rejected or parked directions only when they prevent confusion. Explore only what the idea earns. Do not manufacture personas, metrics, permissions, monetization, rollout plans, accessibility requirements, or generic edge cases. Do not choose a named model or provider; leave such choices configurable unless an authoritative project record has settled them. Use external research only when requested or necessary for product direction, feasibility, or a user-visible constraint. Leave implementation-specific system-contract research to `/pinot-plan`. Recommend other discovery resources when substantial visual exploration is needed.

When no remaining question is likely to change the outcome, behavior, or boundaries, say so and ask whether to explore further or converge. Refine only after the user confirms convergence.

## Living specification

Use this structure while exploring:

```markdown
# [Working title]

> Living exploration: detail is not a decision. Preserve meaningful open possibilities until settled or discarded.

## Current picture

## Still open

## Decisions and boundaries
```

Keep the document as the best current account, not a transcript. Replace superseded statements, distinguish observation from inference and choice, preserve unresolved possibilities under `Still open`, and read the document before resuming an interrupted session.

## Planning handoff

After confirmed convergence, refine the same file to these headings only:

- `## Outcome and context`
- `## Agreed behavior and boundaries`
- `## Planning handoff`

Include only the intended result, material context, essential behavior, confirmed constraints and exclusions, and unresolved technical or external-system questions that could affect product behavior or operating conditions. Do not fill sections for completeness or prescribe files, APIs, algorithms, tests, agents, or phases.

Finish by reporting the specification path, agreed outcome, and questions deliberately handed to `/pinot-plan`. Do not plan or implement unless explicitly asked.
