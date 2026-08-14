# Implementation history

This index is initialized by Pinot setup. It is an append-only lookup map for user-owned semantic implementation records. Janitor adds one chronological line per completed entry and never overwrites an existing line, record, or snapshot.

Use the matching record first when `/pinot-debrief` needs to analyze work. The record points to the project, commit range, exact safe specification/plan snapshots, root and durable-child provenance, review and verification evidence, deviations, remaining work, and Janitor maintenance.

Records may include an aggregate ledger report path and coverage end as period references. Those references are not uniquely attributable to an implementation. Missing history or ledger data is a normal bounded fallback.

History excludes transcripts, checkpoint bodies, credentials, authentication state, sessions, caches, generated reports, and uncertain inputs. Package installation or update must not overwrite user records.
