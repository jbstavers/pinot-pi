# Implementation history

This index is initialized by Pinot setup. It is an append-only lookup map for user-owned semantic implementation records. Janitor adds one chronological line per completed entry and never overwrites an existing line, record, or snapshot.

Use the matching record first when `/pinot-debrief` needs to analyze work. The record points to the project, commits, exact safe specification/plan snapshots, provenance, review and verification evidence, deviations, remaining work, Janitor maintenance, and Debrief lookup pointers.

History excludes transcripts, checkpoint bodies, credentials, authentication state, sessions, caches, generated diagnostic output, and uncertain inputs. Package installation or update must not overwrite user records.
