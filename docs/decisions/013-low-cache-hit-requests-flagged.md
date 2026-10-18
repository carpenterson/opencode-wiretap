# 013: Low cache-hit requests are flagged at 50%

Status: Accepted

## Decision

`RequestSummary.cacheHitRate` is `cache_read ÷ prompt tokens`, computed on the
server from the captured usage and the provider's `UsageConvention`:

- OpenAI-compatible hosts: cached tokens are subtracted from `input_tokens`
  before the prompt total, so the denominator is uncached + cache-read +
  cache-write;
- Anthropic: `input_tokens` is already disjoint from the cache counters.

The request row renders that percentage next to `cache`. Below **50%** the
cache value turns red, the row gets a red left border and a faint red
background, and the row tooltip explains the threshold. `null` (no usage, or
an unknown host convention) is not flagged.

The row also shows the request timestamp: clock only for today, `MM-DD HH:mm`
for older requests, with the full ISO string in the tooltip.

## Rationale

The 798 requests with usage in the captured corpus split sharply: 770 are at
or above 80%, 26 are between 20–80%, and 9 are below 20%. A 50% threshold
surfaces the cold-start and cache-regression requests without painting normal
variance red. The percentage stays visible even above the threshold, so a
reader can judge 60% without opening the detail pane.

Using the provider convention, rather than a raw `cache / input`, keeps the
number meaningful for both OpenAI-compatible and Anthropic captures. A cold
prompt genuinely reports 0%, which is a useful signal; a missing usage block
is unknown and stays neutral.

## Consequences

- The threshold is one constant (`LOW_CACHE_RATE`) in `RequestsPane`; changing
  it does not affect stored data.
- Requests with usage but no cache (including some title-generation calls) are
  flagged. That is intentional: they really did send the prompt cold.
- No capture format changes; the ratio is derived at read time and the API
  returns it alongside the token counts.
- A future provider with a different accounting convention needs an entry in
  `HOSTS` (`packages/server/src/pricing.ts`); otherwise its ratio is `null`
  rather than wrong.
