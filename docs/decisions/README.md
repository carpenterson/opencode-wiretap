# Decisions

Architecture decision records (ADRs). One file per decision, numbered, never
renumbered. A decision that is later reversed keeps its file and gains a
status, so the reasoning behind the reversal has something to point at.

| #   | Decision                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------- |
| 001 | [The plugin bundles `@wiretap/shared`](001-plugin-bundles-shared.md)                                              |
| 002 | [A response is stored in its request's file](002-response-in-request-file.md)                                     |
| 003 | [Cost is computed at read time, from OpenCode's price table](003-cost-computed-at-read-time.md)                   |
| 004 | [Session cost totals come from a background sweep](004-session-totals-swept-in-background.md)                     |
| 005 | [Captures are pruned a session at a time](005-captures-pruned-by-session-age.md)                                  |
| 006 | [Dropdowns are a custom listbox, not a native `<select>`](006-dropdowns-are-a-custom-listbox.md)                  |
| 007 | [Blocks render, with the wire text one click away](007-blocks-render-with-the-wire-text-one-click-away.md)        |
| 008 | [Chat Completions messages are normalized at read time](008-chat-completions-messages-normalized-at-read-time.md) |
| 009 | [Session titles read `session_v2`, falling back to `session`](009-session-titles-read-session-v2.md)              |
| 010 | [System prompts render as a section tree, not one text blob](010-system-prompts-render-as-section-tree.md)        |
| 011 | [V1/V2 origin is inferred per request from the body](011-request-origin-inferred-from-body.md)                    |
| 012 | [Panes resize with splitters; sessions collapse to a rail](012-panes-resize-with-splitters.md)                    |
| 013 | [Low cache-hit requests are flagged at 50%](013-low-cache-hit-requests-flagged.md)                                |

`TEMPLATE.md` is the shape of a new record. Add each decision to the table
when it is created.
