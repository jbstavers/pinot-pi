# Pinot implementation handoff contract

The final source writer supplies this compact handoff at the exact plan path before its durable host closes. Janitor consumes it and does not recreate it:

```markdown
## Janitor handoff
- **Final status / worktree or commit range:**
- **Implemented behavior and paths:**
- **Logging behavior and log/config paths (when applicable):**
- **Review findings / dispositions:**
- **Validation:**
- **Deviations:**
- **Remaining work:**
- **Durable-documentation impacts:**
- **Temporary artifacts (retain/delete rationale):**
- **Exact specification and plan snapshot paths/roles:**
- **Configured history-root exception:**
```

Use concrete current paths and results. State `none` when a field has no entries. The handoff must identify the primary plan and every additional plan’s supplied label/slug, and must make active-work exclusions clear. If it is absent, stale, contradictory, or unsafe, stop and retain uncertainty.
