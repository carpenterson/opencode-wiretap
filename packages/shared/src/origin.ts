import type { ContentBlock, RequestBody } from "./types.ts";

/**
 * Which OpenCode generation produced a captured request.
 *
 * There is no version field in the capture envelope, and the session tables
 * are no longer a reliable signal once V2 has migrated old sessions. The
 * request body is: V1 and V2 use different agent identities, and even their
 * auxiliary title-generation prompts differ.
 */
export type RequestOrigin = "v1" | "v2";

const V2_IDENTITY = /^You are an AI agent running in OpenCode\b/;
const V1_IDENTITY = /^You are (?:opencode|claude code)\b/i;
const TITLE_IDENTITY = /^You are a title generator\b/;
const ANY_IDENTITY =
  /^You are (?:an AI agent running in OpenCode|opencode|claude code)\b/i;

function textOf(content: string | ContentBlock[] | null | undefined): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => (typeof block?.text === "string" ? block.text : ""))
    .join("\n");
}

/**
 * Pull the system prompt out of a request body, whichever shape the provider
 * uses: Anthropic's `system` field, a `role: "system"` message (V1/V2 Chat
 * Completions), or a leading user turn in older captures.
 */
export function getRequestSystemText(body: RequestBody | undefined): string {
  if (!body) return "";

  if (typeof body.system === "string") return body.system;
  if (Array.isArray(body.system)) {
    return body.system
      .map((block) => (typeof block.text === "string" ? block.text : ""))
      .join("\n");
  }

  const messages = body.messages ?? [];
  const systemMessage = messages.find((message) => message.role === "system");
  if (systemMessage) return textOf(systemMessage.content);

  // Some V1 captures put the prompt in the first user turn.
  const first = messages[0];
  const firstText = first ? textOf(first.content) : "";
  return ANY_IDENTITY.test(firstText) ? firstText : "";
}

function toolNames(body: RequestBody | undefined): string[] {
  return (body?.tools ?? [])
    .map((tool) => tool.function?.name ?? tool.name)
    .filter((name): name is string => typeof name === "string");
}

/**
 * Classify one capture. Returns null when the body carries no recognizable
 * marker — better an explicit unknown than a wrong version.
 */
export function detectRequestOrigin(
  body: RequestBody | undefined,
): RequestOrigin | null {
  const text = getRequestSystemText(body);

  if (V2_IDENTITY.test(text)) return "v2";
  if (V1_IDENTITY.test(text)) return "v1";

  // Title generation has no agent identity. V1's prompt uses a Unicode arrow
  // and `@src/auth.ts`; V2's uses `->` and `@src/credential.ts`.
  if (TITLE_IDENTITY.test(text)) {
    if (text.includes("@src/credential.ts") || text.includes(" -> ")) {
      return "v2";
    }
    if (text.includes("@src/auth.ts") || text.includes("→")) return "v1";
  }

  // Last resort: the built-in tool set. V2 exposes `shell`/`execute`; V1's
  // shell tool is called `bash`.
  const names = new Set(toolNames(body));
  if (names.has("shell") || names.has("execute")) return "v2";
  if (names.has("bash")) return "v1";

  return null;
}
