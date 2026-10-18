# 012: Panes resize with splitters; sessions collapse to a rail

Status: Accepted

## Decision

The three-column layout (`SessionsPane | RequestsPane | DetailPane`) is a flex
row, not the previous fixed grid. Two 6px splitters own the column boundaries:

- drag with the pointer (pointer capture keeps the drag alive outside the
  divider);
- arrow keys nudge by 16px, Shift+arrow by 64px;
- double-click resets to the 340/430 defaults;
- widths persist in `localStorage` under `wiretap.sessionsWidth` and
  `wiretap.requestsWidth`.

The detail pane takes the remaining width. A mount/resize pass shrinks the
left panes to keep at least 280px for the detail pane, so a narrow window does
not collapse it to a sliver. The shrink is applied to the effective width
only: the preferred width stays stored and is restored when the window grows
again.

The sessions pane can be collapsed from its header. Collapsed, it becomes a
40px rail with an expand button, the session count, and a vertical label; the
sessions splitter disappears and its previous width is restored on expand.
The collapsed state persists too.

## Rationale

The fixed `grid-cols-[340px_430px_1fr]` was tuned for one screen. Requests now
carry origin, input/output/cache tokens, cost, message count, and size, while
detail content ranges from a one-line response to a full system prompt. No
single set of widths serves both, so the widths have to be the reader's.

Flexbox with explicit widths is simpler than a grid whose tracks are mutated:
the detail pane is `flex-1`, and the two splitters are ordinary siblings with
pointer handlers. A collapse target is a rail rather than `display: none`
because a hidden pane needs a new affordance elsewhere in the chrome; the rail
keeps the count visible and the expand action where the pane used to be.

## Consequences

- Layout preferences are per browser profile, like the theme and auto-fetch
  settings. There is no server-side layout state.
- Narrow viewports get wrapped request rows rather than clipped token counts;
  the panes can still be dragged to give the list more room.
- `SessionsPane` needs `isCollapsed` / `onToggleCollapse` props, and both panes
  no longer draw their own right border — the splitter line is the boundary.
- Keyboard users get the same resize affordance through the separator roles
  and arrow keys; no pointer is required.
