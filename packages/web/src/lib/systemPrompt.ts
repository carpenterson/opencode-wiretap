/**
 * Parser for OpenCode / Claude Code system-prompt text blocks.
 *
 * The full system prompt is injected as the first user message's text block.
 * It begins with "You are OpenCode..." (or "You are Claude Code...") followed
 * by prose, project instruction files ("Instructions from: /path/AGENTS.md"),
 * and top-level XML-tagged sections (<env>, <mcp_instructions>,
 * <available_skills>, <system-reminder>, <example>, ...).
 *
 * Blocks nest: <available_skills> contains many <skill>, each with <name>,
 * <description>, <location>; <mcp_instructions> contains <server name="...">.
 * The parser is recursive and indentation/attribute aware so the UI can render
 * an expandable tree with each section labeled by its tag (and derived name).
 */

export type PromptSegment =
  | { kind: "prose"; text: string }
  | { kind: "instructions"; path: string; text: string }
  | { kind: "xml"; tag: string; attrs: string; text: string };

/** One markdown heading and the prose beneath it, with nested headings. */
export interface HeadingSection {
  level: number;
  title: string;
  body: string;
  children: HeadingSection[];
}

export interface SkillEntry {
  id: string | null;
  name: string;
  description: string;
  location: string | null;
}

export interface ToolEntry {
  name: string;
  /** The full multi-line signature, code-formatted by the renderer. */
  signature: string;
}

export interface ToolGroup {
  name: string;
  count: number | null;
  description: string | null;
  tools: ToolEntry[];
}

// Opening tag at line start (allowing indentation) with optional attributes.
const OPEN_TAG_RE = /^(\s*)<([A-Za-z_][\w-]*)((?:\s[^>]*?)?)>/;
const INSTRUCTIONS_RE = /^\s*Instructions from:\s*(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE_RE = /^\s*(```|~~~)/;

/**
 * V1 shipped `You are OpenCode` / `You are Claude Code`; V2 opens with
 * `You are an AI agent running in OpenCode`. All three are system prompts.
 */
const IDENTITY_RE =
  /^You are (OpenCode|Claude Code|an AI agent running in OpenCode)\b/;

/** Detects text blocks that are (or contain) a system prompt. */
export function isSystemPromptText(text: string): boolean {
  if (!text) return false;
  return IDENTITY_RE.test(text) || /(^|\n)Instructions from:\s*\S/.test(text);
}

/** True when the block is the leading system prompt (for the SYSTEM badge). */
export function startsWithSystemIdentity(text: string): boolean {
  return IDENTITY_RE.test(text ?? "");
}

/** Removes the common leading indentation shared by all non-blank lines. */
function dedent(text: string): string {
  const lines = text.split("\n");
  let min = Infinity;
  for (const l of lines) {
    if (l.trim().length === 0) continue;
    const lead = l.length - l.trimStart().length;
    if (lead < min) min = lead;
  }
  if (!isFinite(min) || min === 0) return text;
  return lines
    .map((l) => (l.trim().length === 0 ? l : l.slice(min)))
    .join("\n");
}

/**
 * Splits system-prompt text into ordered segments. Prose is preserved
 * verbatim; instruction files and multi-line balanced XML blocks become their
 * own segments. Single-line elements (e.g. <name>x</name>) stay inline as
 * prose. Nesting is handled by re-parsing each block's inner text (see
 * `parsePromptSegments` calls in the renderer), so this only splits one level.
 */
export function parsePromptSegments(text: string): PromptSegment[] {
  const lines = text.split("\n");
  const segments: PromptSegment[] = [];
  let prose: string[] = [];

  const flushProse = () => {
    if (prose.length === 0) return;
    const joined = prose.join("\n");
    if (joined.trim().length > 0)
      segments.push({ kind: "prose", text: joined });
    prose = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Instruction file section: header + everything until next top-level marker.
    const instr = line.match(INSTRUCTIONS_RE);
    if (instr) {
      flushProse();
      const path = instr[1].trim();
      const bodyLines: string[] = [];
      i++;
      while (i < lines.length) {
        const l = lines[i];
        if (INSTRUCTIONS_RE.test(l) || OPEN_TAG_RE.test(l)) break;
        bodyLines.push(l);
        i++;
      }
      segments.push({
        kind: "instructions",
        path,
        text: bodyLines.join("\n").replace(/^\n+|\n+$/g, ""),
      });
      continue;
    }

    // XML block: <tag ...> ... </tag> (tag at line start, may be indented).
    const open = line.match(OPEN_TAG_RE);
    if (open) {
      const tag = open[2];
      const attrs = open[3].trim();
      const openEnd = open[0].length;
      const close = `</${tag}>`;

      // Single-line element: <tag>...</tag> on the same line -> keep as prose.
      if (line.indexOf(close, openEnd) !== -1) {
        prose.push(line);
        i++;
        continue;
      }

      // Multi-line block: find the matching close, counting same-name nesting.
      let depth = 1;
      let j = i + 1;
      const sameOpen = new RegExp(`<${tag}(?:\\s[^>]*?)?>`, "g");
      const sameClose = new RegExp(`</${tag}>`, "g");
      for (; j < lines.length; j++) {
        const l = lines[j];
        // Count closes first is unsafe for same-line open+close; count both.
        const opens = (l.match(sameOpen) || []).length;
        const closes = (l.match(sameClose) || []).length;
        depth += opens - closes;
        if (depth <= 0) break;
      }

      if (j < lines.length) {
        flushProse();
        const inner = dedent(lines.slice(i + 1, j).join("\n"));
        segments.push({ kind: "xml", tag, attrs, text: inner });
        i = j + 1;
        continue;
      }
      // No matching close: fall through and treat as prose.
    }

    prose.push(line);
    i++;
  }

  flushProse();
  return segments;
}

/**
 * Splits markdown into a heading tree. Lines inside fenced code blocks are
 * never treated as headings, so a shell comment in an example stays code.
 */
export function parseHeadingSections(text: string): {
  intro: string;
  sections: HeadingSection[];
} {
  const lines = text.split("\n");
  const introLines: string[] = [];
  const flat: Array<{ level: number; title: string; body: string[] }> = [];
  let fence: string | null = null;
  let current: { level: number; title: string; body: string[] } | null = null;

  for (const line of lines) {
    const fenceMarker = line.match(FENCE_RE)?.[1];
    if (fenceMarker) {
      if (fence === null) fence = fenceMarker;
      else if (fenceMarker === fence) fence = null;
      (current?.body ?? introLines).push(line);
      continue;
    }

    const heading = fence === null ? line.match(HEADING_RE) : null;
    if (heading) {
      current = {
        level: heading[1].length,
        title: heading[2].trim(),
        body: [],
      };
      flat.push(current);
      continue;
    }

    (current?.body ?? introLines).push(line);
  }

  const roots: HeadingSection[] = [];
  const stack: HeadingSection[] = [];
  for (const node of flat) {
    const section: HeadingSection = {
      level: node.level,
      title: node.title,
      body: node.body.join("\n").trim(),
      children: [],
    };
    while (stack.length > 0 && stack[stack.length - 1].level >= section.level) {
      stack.pop();
    }
    if (stack.length > 0) stack[stack.length - 1].children.push(section);
    else roots.push(section);
    stack.push(section);
  }

  return { intro: introLines.join("\n").trim(), sections: roots };
}

function xmlText(inner: string, tag: string): string | null {
  const match = inner.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].trim() : null;
}

/** Parses the `<skill>` children of an `<available_skills>` block. */
export function parseSkills(text: string): SkillEntry[] {
  const skills: SkillEntry[] = [];
  const blocks = text.matchAll(/<skill(?:\s[^>]*)?>([\s\S]*?)<\/skill>/g);
  for (const block of blocks) {
    const inner = block[1];
    const id = xmlText(inner, "id");
    const name = xmlText(inner, "name") ?? id;
    if (!name) continue;
    skills.push({
      id,
      name,
      description: xmlText(inner, "description") ?? "",
      location: xmlText(inner, "location"),
    });
  }
  return skills;
}

const TOOL_GROUP_RE =
  /^-\s+(.+?)\s*\((\d+)\s+tools?(?:,\s*\d+\s+shown)?\)\s*(?:\/\/\s*(.*))?$/;
const TOOL_ENTRY_RE = /^\s{2,}-\s+(tools\.\S.*)$/;

/**
 * Parses the `## Available tools` bullet catalog into groups and entries.
 * Signatures are multi-line and kept verbatim; `rest` holds prose that
 * follows the catalog (V2 puts its skills preamble there).
 */
export function parseToolCatalog(text: string): {
  groups: ToolGroup[];
  rest: string;
} {
  const lines = text.split("\n");
  const groups: ToolGroup[] = [];
  let group: ToolGroup | null = null;
  let tool: { name: string; lines: string[] } | null = null;
  let rest: string[] = [];
  let inRest = false;

  const flushTool = () => {
    if (!group || !tool) return;
    group.tools.push({
      name: tool.name,
      signature: tool.lines.join("\n").trim(),
    });
    tool = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inRest) {
      rest.push(line);
      continue;
    }

    const groupMatch = line.match(TOOL_GROUP_RE);
    if (groupMatch) {
      flushTool();
      group = {
        name: groupMatch[1].trim(),
        count: Number(groupMatch[2]),
        description: groupMatch[3]?.trim() || null,
        tools: [],
      };
      groups.push(group);
      continue;
    }

    const entryMatch = group ? line.match(TOOL_ENTRY_RE) : null;
    if (entryMatch) {
      flushTool();
      const signature = line.replace(TOOL_ENTRY_RE, "$1");
      tool = {
        name: signature.split("(")[0].trim(),
        lines: [signature],
      };
      continue;
    }

    if (tool) {
      // A blank line followed by column-0 prose ends the catalog. Indented
      // lines (including `}>` closers) belong to the current signature.
      if (line.trim() === "") {
        const next = lines.slice(i + 1).find((l) => l.trim() !== "");
        if (
          next !== undefined &&
          !/^\s/.test(next) &&
          !TOOL_GROUP_RE.test(next)
        ) {
          flushTool();
          inRest = true;
          rest = lines.slice(i + 1);
          break;
        }
      }
      tool.lines.push(line);
      continue;
    }

    if (group) continue;

    // Prose before the first group: not a tool catalog.
    return { groups: [], rest: text };
  }

  flushTool();
  if (groups.length === 0) return { groups: [], rest: text };
  return { groups, rest: rest.join("\n").trim() };
}

/** Derives a friendly title suffix for an XML block: a `name="X"` attribute
 *  or a leading `<name>X</name>` child, if present. */
export function segTitle(attrs: string, inner: string): string | null {
  const attrName = attrs.match(/\bname\s*=\s*"([^"]*)"/);
  if (attrName) return attrName[1];
  const childName = inner.match(/^\s*<name>([^<]*)<\/name>/m);
  if (childName) return childName[1].trim();
  return null;
}
