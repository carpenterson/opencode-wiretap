# 011: V1/V2 origin is inferred per request from the body

Status: Accepted

## Decision

`detectRequestOrigin(body)` (`packages/shared/src/origin.ts`) classifies one
captured request as `v1`, `v2`, or `null`, using only the request body:

1. V2's agent identity: `You are an AI agent running in OpenCode…` → `v2`.
2. V1's identities: `You are opencode, an interactive CLI tool…`,
   `You are OpenCode…`, `You are Claude Code…` → `v1`.
3. The title-generator prompt: V2 uses `->` and `@src/credential.ts`; V1 uses
   `→` and `@src/auth.ts`.
4. Fallback to the built-in tool set: `shell`/`execute` → `v2`, `bash` → `v1`.
5. Otherwise `null`.

The result rides on `RequestSummary.origin` and is shown next to each request in
the middle pane and in the detail header. There is no session-level V1/V2 badge.

## Rationale

A session is not a version. A conversation can start under V1 and continue
under V2, and once V2 migrates the old rows every session lives in
`session_v2`, so the table no longer says anything about which binary sent a
particular call.

The request body is the faithful evidence: V1 and V2 use different system
prompts, and the difference survives into auxiliary calls such as title
generation. Classifying per file also matches what the viewer shows — one row
is one HTTP call.

The fallback to tool names covers captures where the system prompt is absent
or trimmed; `shell` replaced `bash` in V2. When none of the markers are present
the answer is `null` and the UI shows `—`, rather than guessing.

## Consequences

- A request row can honestly disagree with its neighbours: a session that was
  resumed after upgrading shows V1 on early calls and V2 on later ones.
- Title-generation calls are classified too, via their prompt's example arrow
  and example path.
- New prompt wording or a renamed shell tool requires updating
  `packages/shared/src/origin.ts`. The tests in `origin.test.ts` pin the
  current shapes.
- Captures are unchanged; classification is pure and computed at read time.
