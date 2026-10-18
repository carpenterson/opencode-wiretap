import { useEffect, useMemo, useState } from "react";
import { ArrowClockwise, Check, Copy } from "@phosphor-icons/react";
import type { RequestSummary } from "@wiretap/shared";
import {
  formatBytes,
  formatRequestTime,
  formatTime,
  formatTokens,
  formatUsd,
  shortId,
} from "../lib/format.ts";
import { modelFamily, shortModel } from "../lib/model.ts";
import {
  Spinner,
  ErrorState,
  EmptyState,
  ModelBadge,
  StatusChip,
  CostChip,
  Select,
  OriginBadge,
} from "./ui.tsx";
import type { SelectOption } from "./ui.tsx";

/** Below this cache-hit share the row is flagged red. */
const LOW_CACHE_RATE = 0.5;

/** Hover text breaking a row's cost into the buckets that produced it. */
function costTitle(r: RequestSummary): string {
  const c = r.cost;
  if (!c) return "";
  const parts = [
    ["input", c.input],
    ["output", c.output],
    ["cache read", c.cacheRead],
    ["cache write", c.cacheWrite],
  ] as const;
  const lines = parts
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}  ${formatUsd(v)}`);
  return [`${formatUsd(c.total)} estimated`, ...lines].join("\n");
}

/** One compact token bucket on the request row; full count is in the title. */
function TokenStat({
  label,
  value,
  title,
  suffix,
  tone = "default",
}: {
  label: string;
  value: number | null;
  title: string;
  suffix?: string;
  tone?: "default" | "error";
}) {
  const valueClass = tone === "error" ? "text-block-error" : "text-muted";
  const suffixClass = tone === "error" ? "text-block-error" : "text-faint/70";
  return (
    <span className="tnum inline-flex items-baseline gap-1" title={title}>
      <span className="text-faint/70">{label}</span>
      <span className={valueClass}>{formatTokens(value)}</span>
      {suffix && <span className={suffixClass}>{suffix}</span>}
    </span>
  );
}

export function RequestsPane({
  sessionId,
  requests,
  loading,
  error,
  selectedFile,
  onSelect,
  onRefresh,
}: {
  sessionId: string | null;
  requests: RequestSummary[];
  loading: boolean;
  error: string | null;
  selectedFile: string | null;
  onSelect: (file: string) => void;
  onRefresh: () => void;
}) {
  const [modelFilter, setModelFilter] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Clear the "copied" flash on unmount or when the session changes.
  useEffect(() => setCopied(false), [sessionId]);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  async function copySessionId() {
    if (!sessionId) return;
    await navigator.clipboard.writeText(sessionId);
    setCopied(true);
  }

  const models = useMemo(() => {
    const set = new Set<string>();
    for (const r of requests) if (r.model) set.add(r.model);
    return [...set].sort();
  }, [requests]);

  // The menu carries the same badge the rows do, so filtering by model looks
  // like the thing being filtered.
  const modelOptions = useMemo<SelectOption<string>[]>(
    () => [
      { value: "", label: `all models (${requests.length})` },
      ...models.map((m) => ({
        value: m,
        label: shortModel(m),
        render: <ModelBadge label={shortModel(m)} family={modelFamily(m)} />,
      })),
    ],
    [models, requests.length],
  );

  const rows = useMemo(() => {
    const filtered = modelFilter
      ? requests.filter((r) => r.model === modelFilter)
      : requests;
    return [...filtered].sort((a, b) => a.seq - b.seq);
  }, [requests, modelFilter]);

  // Total for what is actually on screen, so it tracks the model filter.
  // Null when nothing in view carries a price at all.
  const shownCost = useMemo(() => {
    const priced = rows.filter((r) => r.cost != null);
    if (priced.length === 0) return null;
    return priced.reduce((sum, r) => sum + (r.cost?.total ?? 0), 0);
  }, [rows]);

  if (!sessionId) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-surface">
        <EmptyState
          title="Select a session"
          hint="Pick a session on the left to list its captured requests."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-surface">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-semibold tracking-wide text-ink">
            REQUESTS
          </span>
          <span
            className="tnum truncate text-[13px] text-faint"
            title={sessionId}
          >
            {shortId(sessionId)}
          </span>
          <button
            onClick={copySessionId}
            title={copied ? "Copied session id" : "Copy session id"}
            aria-label="Copy session id"
            className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-elevated hover:text-ink active:translate-y-px"
          >
            {copied ? (
              <Check
                size={12}
                weight="bold"
                className="text-block-tool-result"
              />
            ) : (
              <Copy size={12} />
            )}
          </button>
        </div>
        <button
          onClick={onRefresh}
          title="Refresh"
          className="rounded p-1 text-muted transition-colors hover:bg-elevated hover:text-ink active:translate-y-px"
        >
          <ArrowClockwise size={14} weight="bold" />
        </button>
      </header>

      {models.length > 1 && (
        <div className="border-b border-border px-3 py-2">
          <Select
            value={modelFilter}
            onChange={setModelFilter}
            title="Filter by model"
            ariaLabel="Filter by model"
            className="w-full"
            options={modelOptions}
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && <Spinner label="reading requests…" />}
        {error && <ErrorState message={error} />}
        {rows.map((r) => {
          const active = r.file === selectedFile;
          const lowCache =
            r.cacheHitRate != null && r.cacheHitRate < LOW_CACHE_RATE;
          const cachePct =
            r.cacheHitRate == null
              ? undefined
              : `${Math.round(r.cacheHitRate * 100)}%`;
          const cacheTokens =
            r.cacheReadTokens == null && r.cacheWriteTokens == null
              ? null
              : (r.cacheReadTokens ?? 0) + (r.cacheWriteTokens ?? 0);
          const cacheTitle =
            [
              r.cacheReadTokens != null
                ? `cache read ${r.cacheReadTokens.toLocaleString()}`
                : null,
              r.cacheWriteTokens != null
                ? `cache write ${r.cacheWriteTokens.toLocaleString()}`
                : null,
              cachePct ? `hit rate ${cachePct}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "no cache usage reported";
          return (
            <button
              key={r.file}
              onClick={() => onSelect(r.file)}
              title={
                lowCache
                  ? `low cache hit rate (${cachePct}) — below ${LOW_CACHE_RATE * 100}%`
                  : undefined
              }
              className={`flex w-full flex-col gap-0.5 border-l-2 px-3 py-1.5 text-left transition-colors ${
                active
                  ? "border-accent bg-elevated"
                  : lowCache
                    ? "border-block-error/70 bg-block-error/5 hover:bg-block-error/10"
                    : "border-transparent hover:bg-surface-2"
              }`}
            >
              <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="tnum w-9 shrink-0 text-[13px] text-faint">
                  #{String(r.seq).padStart(4, "0")}
                </span>
                <OriginBadge origin={r.origin} />
                <ModelBadge
                  label={shortModel(r.model)}
                  family={modelFamily(r.model)}
                />
                <span className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                  <span
                    className="tnum text-[12px] text-faint"
                    title={r.timestamp}
                  >
                    {formatRequestTime(r.timestamp)}
                  </span>
                  <StatusChip status={r.status} />
                  <CostChip
                    usd={r.cost?.total ?? null}
                    title={r.cost ? costTitle(r) : undefined}
                    className="w-14 text-right"
                  />
                </span>
              </span>
              <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 pl-9 text-[12px] text-faint">
                <TokenStat
                  label="in"
                  value={r.inputTokens}
                  title={
                    r.inputTokens == null
                      ? "no input usage reported"
                      : `input ${r.inputTokens.toLocaleString()} tokens (includes cached input for OpenAI-compatible providers)`
                  }
                />
                <TokenStat
                  label="cache"
                  value={cacheTokens}
                  suffix={cachePct}
                  tone={lowCache ? "error" : "default"}
                  title={cacheTitle}
                />
                <TokenStat
                  label="out"
                  value={r.outputTokens}
                  title={
                    r.outputTokens == null
                      ? "no output usage reported"
                      : `output ${r.outputTokens.toLocaleString()} tokens (reasoning included)`
                  }
                />
                <span className="tnum ml-auto" title="messages">
                  {r.messageCount} msg
                </span>
                <span
                  className="tnum w-12 text-right"
                  title={`${r.size.toLocaleString()} bytes`}
                >
                  {formatBytes(r.size)}
                </span>
              </span>
            </button>
          );
        })}
        {rows.length > 0 && (
          <div className="tnum flex items-center gap-2 px-3 py-2 text-[12px] text-faint">
            <span>
              {rows.length} request{rows.length === 1 ? "" : "s"} ·{" "}
              {formatTime(rows[rows.length - 1].timestamp)}
            </span>
            {shownCost != null && (
              <span
                className="ml-auto font-medium text-muted"
                title="sum of the priced requests shown"
              >
                {formatUsd(shownCost)}
              </span>
            )}
          </div>
        )}
        {!loading && rows.length === 0 && !error && (
          <div className="px-3 py-4 text-xs text-faint">no requests</div>
        )}
      </div>
    </div>
  );
}
