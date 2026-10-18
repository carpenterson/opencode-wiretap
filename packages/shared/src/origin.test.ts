import { describe, expect, test } from "bun:test";
import { detectRequestOrigin } from "./origin.ts";
import type { RequestBody } from "./types.ts";

function withSystem(text: string): RequestBody {
  return { messages: [{ role: "system", content: text }] };
}

describe("detectRequestOrigin", () => {
  test("recognizes the V2 agent identity", () => {
    expect(
      detectRequestOrigin(
        withSystem(
          "You are an AI agent running in OpenCode, a coding agent harness.",
        ),
      ),
    ).toBe("v2");
  });

  test("recognizes the V1 CLI identity", () => {
    expect(
      detectRequestOrigin(
        withSystem(
          "You are opencode, an interactive CLI tool that helps users with software engineering tasks.",
        ),
      ),
    ).toBe("v1");
  });

  test("recognizes a V1 system field", () => {
    expect(
      detectRequestOrigin({ system: "You are Claude Code, Anthropic's CLI." }),
    ).toBe("v1");
  });

  test("recognizes the V1 title generator prompt", () => {
    expect(
      detectRequestOrigin(
        withSystem(
          'You are a title generator. You output ONLY a thread title.\n\n"best practices for React hooks" → React hooks best practices\n\n<auth.ts>',
        ),
      ),
    ).toBe("v1");
  });

  test("recognizes the V2 title generator prompt", () => {
    expect(
      detectRequestOrigin(
        withSystem(
          'You are a title generator. You output ONLY a thread title.\n\n"best practices for React hooks" -> React hooks best practices\n\n@src/credential.ts',
        ),
      ),
    ).toBe("v2");
  });

  test("falls back to the tool set when the prompt has no identity", () => {
    expect(
      detectRequestOrigin({
        tools: [{ function: { name: "shell" } }, { name: "read" }],
      }),
    ).toBe("v2");
    expect(
      detectRequestOrigin({
        tools: [{ type: "function", function: { name: "bash" } }],
      }),
    ).toBe("v1");
  });

  test("returns null when the body carries no version marker", () => {
    expect(
      detectRequestOrigin(
        withSystem("You are a title generator. Nothing else here."),
      ),
    ).toBeNull();
    expect(detectRequestOrigin(undefined)).toBeNull();
  });
});
