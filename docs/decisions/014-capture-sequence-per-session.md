# 014: Capture numbers are per-session; display order comes from filenames

Status: Accepted

## Decision

Two related changes:

- **Write side** (`packages/plugin/src/write.ts`): the next `seq` is
  `max(existing _NNNN.json in this session directory) + 1`, not a module-level
  counter. The directory is the durable record, so a plugin reload cannot
  rewind numbering.
- **Read side** (`packages/server/src/order.ts`): the request list sorts rows
  by filename (the ISO timestamp prefix) and renumbers them `1..N` for display.
  The `seq` returned by `/api/sessions/:id` is therefore a display ordinal, not
  the number embedded in the filename.

## Rationale

The old counter lived only in memory:

```ts
let sequence = 0;
```

OpenCode V2 watches plugin files and re-imports them on change, and session
compaction can reload the runtime. The counter reset to zero while the session
directory still held `_0066.json` and later. Because the counter was shared
across sessions, another session could consume 66 requests first and make the
next write in this session collide at `_0066.json`.

The directory is already the source of truth for captures; scanning it once per
write is cheap relative to the HTTP call being captured and makes numbering
survive reloads. Sorting by filename on the read side is likewise the only
stable order available: filenames are timestamp-prefixed, so lexical order is
chronological, and renumbering hides historical duplicates without rewriting
capture files.

## Consequences

- Display numbers are unique and chronological even for sessions captured
  before this change; filenames keep their original (possibly duplicate)
  numbers, and no capture is renamed or deleted.
- `RequestSummary.seq` no longer means "the number in the filename". Anything
  that needs the on-disk number must parse the filename.
- `nextSequence` is a synchronous scan per write. It is safe within one process;
  a multi-process writer could still race. If that becomes real, use exclusive
  creation (`wx`) with retry rather than a lock file.
- `write.test.ts` pins reload resumption and per-session independence;
  `order.test.ts` pins duplicate-number ordering and input immutability.
