# 009: Session titles read `session_v2`, falling back to `session`

Status: Accepted

## Decision

`getSessionMeta` (`packages/server/src/db.ts`) resolves ids against both
OpenCode session tables. For each chunk it queries `session_v2` first, then
the legacy `session` table, and merges per field:

- a non-null value from `session_v2` wins;
- a null/missing field falls back to the legacy row;
- a missing table is treated as "contributes nothing", not an error.

`readSessionMeta` takes the `SqliteDriver` directly so the merge logic and SQL
are unit-tested without a real OpenCode database.

## Rationale

OpenCode 2.0.32 migrated live sessions into `session_v2`. The old `session`
table still exists and still holds sessions that were never migrated, but it
stops receiving updates. The viewer only queried `session`, so every V2-era
session appeared in the list by id with no title, parent, or directory.

Detecting the version and choosing a table would add a branch that goes stale
the moment the schema moves again. Querying both and ignoring a missing table
is one extra indexed lookup per chunk (ids are primary keys) and works
unchanged on pre-V2 databases. Merging per field rather than per row matters
because a partially migrated row can have `title: null` while the legacy row
still has the generated title.

## Consequences

- The viewer shows titles for both migrated and legacy sessions, matching what
  OpenCode's own UI shows.
- Session-level V1/V2 labels are deliberately absent: once V2 migrates the
  legacy rows, table provenance no longer says which OpenCode version sent a
  given request. The request list carries the badge instead (ADR 011).
- `packages/server/src/db.test.ts` pins v2 preference, field fallback, and the
  pre-V2 schema.
- A future `session_v3` means adding one entry to `SESSION_TABLES`; no caller
  changes.
- The legacy query still runs for every chunk even on V2 databases. With
  primary-key lookups this is negligible, and it keeps the fallback honest
  without a schema-probe cache.
