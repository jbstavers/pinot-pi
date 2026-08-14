---
description: Explore an idea into a living, convergent product specification
argument-hint: "<idea or intended outcome>"
---
Use this as the initial idea: $@

Help the user decide what this product or feature should be. Produce a concise living specification for `/pinot-plan`; do not plan or implement it.

## Discovery

Start with a short orientation: restate the intended outcome and identify the likely project or context root from the request. Inspect only directly relevant instructions and behavior. If the root is unclear, ask only what is needed to identify it.

If an established specification exists, locate it from the project’s documented conventions, read it, and resume its settled outcome, context, decisions, boundaries, and open questions. Do not broad-search for specifications. If several locations are plausible, ask which one. Otherwise create a living Markdown specification at the established location or `docs/+specs/<slug>-spec.md`, and report the path.

Separate observations, implications, and choices that remain the user’s. An inference is not a requirement. Establish the operating context and ordinary user experience. An outcome-changing question is justified only when its answer can alter the result; ask one at a time or as one inseparable group, and update the specification after each material answer. Offer concrete options and a recommendation when useful, without treating the recommendation as approval.

Keep the umbrella outcome, meaningful components, alternatives, and less-explored facets visible. Do not manufacture personas, metrics, permissions, rollout plans, or generic edge cases. Do not choose a named model or provider; leave those configurable unless an authoritative project record has settled them.

When no remaining question is likely to change the outcome, say so and ask whether to explore further or converge. Refine only after the user confirms convergence.

## Living specification

Use this structure while exploring:

```markdown
# [Working title]

> Living exploration: detail is not a decision. Preserve meaningful open possibilities until settled or discarded.

## Current picture

## Still open

## Decisions and boundaries
```

Keep it as the best current account, not a transcript. Replace superseded statements, distinguish observation from inference and choice, and preserve unresolved possibilities under `Still open`.

## Planning handoff

After confirmed convergence, refine the same file to these headings only:

- `## Outcome and context`
- `## Agreed behavior and boundaries`
- `## Planning handoff`

The result must stand alone for a fresh `/pinot-plan` run without prescribing files, APIs, algorithms, tests, agents, or phases. Finish by reporting the specification path, agreed outcome, and questions deliberately handed to planning. Do not plan or implement unless explicitly asked.
