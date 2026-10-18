import { describe, expect, test } from "bun:test";
import { getRequestMessages } from "./normalize.ts";
import type { RequestBody } from "./types.ts";

/**
 * OpenCode V2 sends Chat Completions payloads through the native HTTP hook.
 * Unlike the Anthropic captures this viewer grew up on, assistant turns can
 * carry `content: null` plus `tool_calls`, and tool results arrive as their
 * own `role: "tool"` messages. Those shapes must be normalized before the UI
 * sees them: `content` is never null to a renderer.
 */
describe("OpenAI Chat Completions request messages", () => {
  test("assistant tool turn with null content becomes tool_use blocks", () => {
    const body: RequestBody = {
      messages: [
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "shell", arguments: '{"command":"ls"}' },
            },
          ],
        },
      ],
    };

    expect(getRequestMessages(body)).toEqual([
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "call_1",
            name: "shell",
            input: { command: "ls" },
          },
        ],
      },
    ]);
  });

  test("reasoning, prose and tool calls keep their wire order", () => {
    const body: RequestBody = {
      messages: [
        {
          role: "assistant",
          content: "Checking the directory.",
          reasoning_content: "I should list files first.",
          tool_calls: [
            {
              id: "call_1",
              function: { name: "shell", arguments: '{"command":"ls"}' },
            },
          ],
        },
      ],
    };

    expect(getRequestMessages(body)[0].content).toEqual([
      { type: "thinking", thinking: "I should list files first." },
      { type: "text", text: "Checking the directory." },
      {
        type: "tool_use",
        id: "call_1",
        name: "shell",
        input: { command: "ls" },
      },
    ]);
  });

  test("tool result messages become tool_result blocks", () => {
    const body: RequestBody = {
      messages: [
        {
          role: "tool",
          tool_call_id: "call_1",
          content: "file-a\nfile-b\n",
        },
      ],
    };

    expect(getRequestMessages(body)).toEqual([
      {
        role: "tool",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_1",
            content: "file-a\nfile-b\n",
          },
        ],
      },
    ]);
  });

  test("a truncated tool argument stays a string instead of being lost", () => {
    const body: RequestBody = {
      messages: [
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              function: { name: "shell", arguments: '{"command":"ls' },
            },
          ],
        },
      ],
    };

    const blocks = getRequestMessages(body)[0].content;
    expect(blocks).toEqual([
      {
        type: "tool_use",
        id: "call_1",
        name: "shell",
        input: '{"command":"ls',
      },
    ]);
  });
});

describe("Anthropic Messages request messages", () => {
  test("content blocks pass through unchanged", () => {
    const body: RequestBody = {
      messages: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "Hi" },
            { type: "tool_use", id: "t1", name: "read", input: {} },
          ],
        },
      ],
    };

    expect(getRequestMessages(body)).toEqual([
      {
        role: "assistant",
        content: [
          { type: "text", text: "Hi" },
          { type: "tool_use", id: "t1", name: "read", input: {} },
        ],
      },
    ]);
  });
});
