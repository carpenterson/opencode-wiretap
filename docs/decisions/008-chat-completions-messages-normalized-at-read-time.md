# 008: Chat Completions messages are normalized at read time

Status: Accepted

## Decision

`getRequestMessages` (`packages/shared/src/normalize.ts`) is the only place
that translates a captured `messages` array into the viewer's block
vocabulary. OpenAI Chat Completions shapes are handled alongside Anthropic
Messages in the same pass:

- assistant `tool_calls[]` become `tool_use` blocks; `function.arguments` goes
  through `parseJsonLoose`, so a streamed fragment stays readable text;
- `content: null` becomes an empty block list and never reaches a component;
- a `role: "tool"` message with `tool_call_id` becomes a `tool_result` block;
- `reasoning_content` becomes a leading `thinking` block;
- tools nested under `function` are shown under the same heading as
  Anthropic's top-level `name`/`description`.

`Message` stays the UI shape (`content` is always a string or block array).
The wire shape is the separate `RequestMessage`, which admits `null` and the
chat-only fields.

## Rationale

OpenCode V2 captures provider-native requests through its HTTP hook. In
practice that means Chat Completions payloads from DeepSeek/OpenAI-compatible
providers: an assistant turn that only calls tools has `content: null` and
carries `tool_calls`, and tool output is a separate `role: "tool"` turn. The
viewer assumed Anthropic Messages, where every message has content, so the
first such capture crashed the detail pane on `content.some(...)`.

The alternative — teaching every block renderer to understand both dialects —
puts a null guard and two field layouts in every component forever, and the
next provider adds a third. Normalizing once at the boundary keeps the
renderer's contract simple: it only ever sees blocks. The raw JSON mode still
shows the untouched wire body, so nothing is hidden from someone debugging the
actual payload.

## Consequences

- `packages/shared/src/normalize.test.ts` pins the Chat Completions mappings,
  including truncated tool arguments and Anthropic pass-through.
- Captures written by V1 (Anthropic block arrays) normalize to the same
  blocks they rendered before; string content now becomes a single `text`
  block rather than staying a string, which the renderer already accepted.
- New provider fields that are not part of the block vocabulary remain
  visible in raw mode without requiring a renderer change.
