import { describe, expect, test } from "bun:test";
import {
  isSystemPromptText,
  parseHeadingSections,
  parseSkills,
  parseToolCatalog,
  startsWithSystemIdentity,
} from "./systemPrompt.ts";

describe("V2 system prompt detection", () => {
  test("recognizes the V2 identity sentence", () => {
    const text =
      "You are an AI agent running in OpenCode, a coding agent harness.";
    expect(isSystemPromptText(text)).toBe(true);
    expect(startsWithSystemIdentity(text)).toBe(true);
  });

  test("still recognizes V1 identities", () => {
    expect(isSystemPromptText("You are OpenCode, the best coding agent.")).toBe(
      true,
    );
    expect(startsWithSystemIdentity("You are Claude Code.")).toBe(true);
  });
});

describe("parseHeadingSections", () => {
  test("splits a preamble and nested markdown headings", () => {
    const { intro, sections } = parseHeadingSections(`Intro line.

# Harness
Rules here.

## Available tools
- one
- two

### Nested
deep

# Next
last
`);

    expect(intro.trim()).toBe("Intro line.");
    expect(sections.map((s) => [s.level, s.title])).toEqual([
      [1, "Harness"],
      [1, "Next"],
    ]);
    expect(sections[0].body.trim()).toBe("Rules here.");
    expect(sections[0].children.map((s) => [s.level, s.title])).toEqual([
      [2, "Available tools"],
    ]);
    expect(sections[0].children[0].children[0].title).toBe("Nested");
    expect(sections[0].children[0].children[0].body.trim()).toBe("deep");
    expect(sections[1].body.trim()).toBe("last");
  });

  test("does not treat # inside a fenced block as a heading", () => {
    const { sections } = parseHeadingSections(`# Real
\`\`\`sh
# not a heading
\`\`\`
after
`);
    expect(sections).toHaveLength(1);
    expect(sections[0].children).toHaveLength(0);
    expect(sections[0].body).toContain("# not a heading");
  });
});

describe("parseSkills", () => {
  test("reads the numbered-list fields from <available_skills>", () => {
    const skills = parseSkills(`
  <skill>
    <id>brainstorming</id>
    <name>brainstorming</name>
    <description>Use before creative work.</description>
  </skill>
  <skill>
    <id>report</id>
    <name>Report</name>
    <description>Publish an issue with \`gh\`.</description>
  </skill>
`);

    expect(skills).toEqual([
      {
        id: "brainstorming",
        name: "brainstorming",
        description: "Use before creative work.",
        location: null,
      },
      {
        id: "report",
        name: "Report",
        description: "Publish an issue with `gh`.",
        location: null,
      },
    ]);
  });
});

describe("parseToolCatalog", () => {
  test("groups tools, keeps full signatures and returns trailing prose", () => {
    const body = `- opencode (2 tools) // Tools for managing OpenCode itself.
  - tools.opencode.session_move({
  /** Directory. */
  directory: string,
}): Promise<{ id: string }> // Move a session.
  - tools.opencode.models({
  query?: string,
}): Promise<{ total: number }> // Search models.

Skills provide specialized instructions.
Use the skill tool to load one.
`;

    const { groups, rest } = parseToolCatalog(body);

    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("opencode");
    expect(groups[0].count).toBe(2);
    expect(groups[0].description).toBe("Tools for managing OpenCode itself.");
    expect(groups[0].tools.map((t) => t.name)).toEqual([
      "tools.opencode.session_move",
      "tools.opencode.models",
    ]);
    expect(groups[0].tools[0].signature).toContain("directory: string");
    expect(groups[0].tools[1].signature).toContain("query?: string");
    expect(rest.trim()).toBe(
      "Skills provide specialized instructions.\nUse the skill tool to load one.",
    );
  });
});
