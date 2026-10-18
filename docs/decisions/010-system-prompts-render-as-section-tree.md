# 010: System prompts render as a section tree, not one text blob

Status: Accepted

## Decision

`SystemPromptText` (`packages/web/src/components/DetailPane.tsx`) now renders a
system prompt in three layers:

- `parseHeadingSections` splits markdown `#`…`######` headings into a tree.
  Each heading is its own collapsible; lines inside fenced code are never
  headings.
- Section bodies go through the shared `Markdown` renderer, so fenced examples
  become `<pre><code>` blocks, inline backticks become `<code>`, and lists and
  tables keep their markdown structure.
- Two V2-specific catalogs get structure beyond markdown: `parseToolCatalog`
  turns `## Available tools` into numbered groups (`1`, `1.1`, `1.2`, …) with
  each multi-line signature behind a collapsible; `parseSkills` turns
  `<available_skills>` into a numbered list of name, id, and description.
  Either parser falls back to plain markdown when its shape is not found.

V2's opening identity (`You are an AI agent running in OpenCode`) is now
recognized alongside V1's `You are OpenCode` / `You are Claude Code`, so the V2
system message is labelled `SYSTEM PROMPT` instead of a generic text block. The
same heading tree applies to `Instructions from:` files.

## Rationale

OpenCode V2 sends its system prompt as markdown with no XML sections: identity
prose, then `# Harness`, `# Communication`, `# Code Mode`, `## Available tools`,
`# AGENTS.md` headings, and an `<available_skills>` block. The old parser only
understood V1 XML tags and instruction-file boundaries, so it rendered the
whole prompt as one `<pre>`: headings were literal `#` lines, the tool catalog
was an unreadable wall of signatures, and the 18 skills were indistinguishable
from prose.

Rendering everything through `Markdown` alone would fix code and lists but not
the two navigation problems: a 5,000-character tools section still buries the
skill list, and headings still cannot be collapsed. Splitting headings is a
few dozen lines and reuses the markdown renderer for the bodies, so it buys the
structure without a second markdown implementation. Numbering tools and skills
is what makes a long catalog scannable; the existing raw JSON toggle still
shows the byte-faithful prompt when that is what matters.

## Consequences

- V2 system prompts are navigable: H1 sections open by default, deeper
  headings start collapsed, and every section toggles independently.
- Tool signatures stay faithful, including their `//` descriptions, and open
  as monospace blocks rather than wrapped prose.
- The tool-catalog parser is deliberately narrow: it recognizes
  `- group (N tools) // description` followed by `  - tools.…` entries. Any
  other provider shape falls back to markdown, so nothing disappears.
- `parseHeadingSections` must track fenced code; adding a new fence style means
  updating `FENCE_RE`.
- The renderer remains client-side. Captures are unchanged, and the raw view
  still exposes the original prompt text.
