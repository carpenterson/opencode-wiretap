import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Pulse, Sun, Moon, Timer } from "@phosphor-icons/react";
import { api } from "./api.ts";
import { useTheme } from "./lib/theme.ts";
import {
  useAutoFetch,
  AUTO_FETCH_INTERVALS,
  type AutoFetchInterval,
} from "./lib/autoFetch.ts";
import type {
  SessionSummary,
  RequestSummary,
  CapturedRequest,
} from "@wiretap/shared";
import { SessionsPane } from "./components/SessionsPane.tsx";
import { RequestsPane } from "./components/RequestsPane.tsx";
import { DetailPane } from "./components/DetailPane.tsx";
import { Select, type SelectOption } from "./components/ui.tsx";

const INTERVAL_OPTIONS: readonly SelectOption<AutoFetchInterval>[] =
  AUTO_FETCH_INTERVALS.map((ms) => ({
    value: ms,
    label: ms % 60000 === 0 ? `${ms / 60000}m` : `${ms / 1000}s`,
  }));

const SESSIONS_MIN = 200;
const SESSIONS_MAX = 620;
const REQUESTS_MIN = 280;
const REQUESTS_MAX = 900;
const DETAIL_MIN = 280;
const SESSIONS_RAIL = 40;
const SPLITTER = 6;
const SESSIONS_DEFAULT = 340;
const REQUESTS_DEFAULT = 430;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function storedWidth(
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof window === "undefined") return fallback;
  try {
    const n = Number(window.localStorage.getItem(key));
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Draggable divider between panes. The visible line is 1px; the hit target is
 * the 6px column so it can be grabbed without pixel hunting. Pointer capture
 * keeps the drag alive when the cursor leaves the divider.
 */
function Splitter({
  label,
  value,
  min,
  max,
  onStart,
  onMove,
  onEnd,
  onReset,
  onNudge,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onStart: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onEnd: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onReset: () => void;
  onNudge: (delta: number) => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={`${label} — drag, or use arrow keys; double-click to reset`}
      onPointerDown={onStart}
      onPointerMove={onMove}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      onDoubleClick={onReset}
      onKeyDown={(e: ReactKeyboardEvent<HTMLDivElement>) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        onNudge((e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 64 : 16));
      }}
      className="group relative w-1.5 shrink-0 cursor-col-resize touch-none bg-transparent focus:outline-none"
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-accent group-focus-visible:bg-accent" />
    </div>
  );
}

export function App() {
  const [theme, toggleTheme] = useTheme();
  const [autoFetch, autoFetchInterval, setAutoFetch, setAutoFetchInterval] =
    useAutoFetch();
  const [logDir, setLogDir] = useState<string>("");
  const [dbFound, setDbFound] = useState<boolean>(true);
  const [pricingFound, setPricingFound] = useState<boolean>(true);
  const [costing, setCosting] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [detail, setDetail] = useState<CapturedRequest | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [sessionsWidth, setSessionsWidth] = useState(() =>
    storedWidth(
      "wiretap.sessionsWidth",
      SESSIONS_DEFAULT,
      SESSIONS_MIN,
      SESSIONS_MAX,
    ),
  );
  const [requestsWidth, setRequestsWidth] = useState(() =>
    storedWidth(
      "wiretap.requestsWidth",
      REQUESTS_DEFAULT,
      REQUESTS_MIN,
      REQUESTS_MAX,
    ),
  );
  const [sessionsCollapsed, setSessionsCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        window.localStorage.getItem("wiretap.sessionsCollapsed") === "true"
      );
    } catch {
      return false;
    }
  });
  const layoutRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pane: "sessions" | "requests";
    startX: number;
    startWidth: number;
  } | null>(null);
  const preferred = useRef({
    sessions: sessionsWidth,
    requests: requestsWidth,
  });
  const collapsedRef = useRef(sessionsCollapsed);
  useEffect(() => {
    collapsedRef.current = sessionsCollapsed;
  }, [sessionsCollapsed]);

  const remember = useCallback(
    (pane: "sessions" | "requests", width: number) => {
      preferred.current[pane] = width;
      try {
        window.localStorage.setItem(`wiretap.${pane}Width`, String(width));
      } catch {}
    },
    [],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "wiretap.sessionsCollapsed",
        String(sessionsCollapsed),
      );
    } catch {}
  }, [sessionsCollapsed]);

  const fitLayout = useCallback(() => {
    const total = layoutRef.current?.clientWidth;
    if (!total) return;
    const collapsed = collapsedRef.current;
    const { sessions, requests } = preferred.current;
    const splitters = collapsed ? SPLITTER : SPLITTER * 2;
    const shownSessions = collapsed ? SESSIONS_RAIL : sessions;

    const maxRequests = total - shownSessions - DETAIL_MIN - splitters;
    const nextRequests = Math.min(
      requests,
      Math.max(REQUESTS_MIN, maxRequests),
    );
    const maxSessions = total - nextRequests - DETAIL_MIN - splitters;
    const nextSessions = collapsed
      ? sessions
      : Math.min(sessions, Math.max(SESSIONS_MIN, maxSessions));

    setSessionsWidth(nextSessions);
    setRequestsWidth(nextRequests);
  }, []);

  useEffect(() => {
    fitLayout();
    window.addEventListener("resize", fitLayout);
    return () => window.removeEventListener("resize", fitLayout);
  }, [fitLayout]);

  useEffect(() => {
    fitLayout();
  }, [fitLayout, sessionsCollapsed]);

  const startResize = useCallback(
    (pane: "sessions" | "requests", e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = {
        pane,
        startX: e.clientX,
        startWidth: pane === "sessions" ? sessionsWidth : requestsWidth,
      };
    },
    [sessionsWidth, requestsWidth],
  );

  const moveResize = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const active = drag.current;
      if (!active) return;
      const total = layoutRef.current?.clientWidth ?? window.innerWidth;
      const delta = e.clientX - active.startX;
      if (active.pane === "sessions") {
        const room = total - requestsWidth - DETAIL_MIN - SPLITTER * 2;
        const next = clamp(
          active.startWidth + delta,
          SESSIONS_MIN,
          Math.min(SESSIONS_MAX, Math.max(SESSIONS_MIN, room)),
        );
        remember("sessions", next);
        setSessionsWidth(next);
      } else {
        const sessions = sessionsCollapsed ? SESSIONS_RAIL : sessionsWidth;
        const splitters = sessionsCollapsed ? 1 : 2;
        const room = total - sessions - DETAIL_MIN - SPLITTER * splitters;
        const next = clamp(
          active.startWidth + delta,
          REQUESTS_MIN,
          Math.min(REQUESTS_MAX, Math.max(REQUESTS_MIN, room)),
        );
        remember("requests", next);
        setRequestsWidth(next);
      }
    },
    [requestsWidth, sessionsWidth, sessionsCollapsed, remember],
  );

  const endResize = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const nudgeSessions = useCallback(
    (delta: number) => {
      const total = layoutRef.current?.clientWidth ?? window.innerWidth;
      const room = total - requestsWidth - DETAIL_MIN - SPLITTER * 2;
      setSessionsWidth((w) => {
        const next = clamp(
          w + delta,
          SESSIONS_MIN,
          Math.min(SESSIONS_MAX, Math.max(SESSIONS_MIN, room)),
        );
        remember("sessions", next);
        return next;
      });
    },
    [requestsWidth, remember],
  );

  const nudgeRequests = useCallback(
    (delta: number) => {
      const total = layoutRef.current?.clientWidth ?? window.innerWidth;
      const sessions = sessionsCollapsed ? SESSIONS_RAIL : sessionsWidth;
      const splitters = sessionsCollapsed ? 1 : 2;
      const room = total - sessions - DETAIL_MIN - SPLITTER * splitters;
      setRequestsWidth((w) => {
        const next = clamp(
          w + delta,
          REQUESTS_MIN,
          Math.min(REQUESTS_MAX, Math.max(REQUESTS_MIN, room)),
        );
        remember("requests", next);
        return next;
      });
    },
    [sessionsWidth, sessionsCollapsed, remember],
  );

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      setSessions(await api.sessions());
    } catch (e) {
      setSessionsError(e instanceof Error ? e.message : String(e));
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const loadRequests = useCallback(async (id: string) => {
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      setRequests(await api.requests(id));
    } catch (e) {
      setRequestsError(e instanceof Error ? e.message : String(e));
      setRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
    api
      .config()
      .then((c) => {
        setLogDir(c.logDir);
        setDbFound(c.dbFound);
        setPricingFound(c.pricingFound);
      })
      .catch(() => {});
  }, [loadSessions]);

  // Cost totals arrive from a background sweep, so poll while it runs and
  // refresh the session list when it finishes. Without this, a cold cache
  // shows blank costs until the user happens to hit refresh.
  useEffect(() => {
    let cancelled = false;
    let wasRunning = false;
    const tick = async () => {
      try {
        const s = await api.costStatus();
        if (cancelled) return;
        setCosting(s.running ? s : null);
        if (wasRunning && !s.running) void loadSessions();
        wasRunning = s.running;
      } catch {
        if (!cancelled) setCosting(null);
      }
    };
    void tick();
    const timer = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [loadSessions]);

  // Periodically refresh the sessions list (and the currently open session's
  // requests, if any) while auto-fetch is on. Off by default; both the
  // toggle and interval choice persist across reloads via useAutoFetch.
  useEffect(() => {
    if (!autoFetch) return;
    const timer = setInterval(() => {
      void loadSessions();
      if (selectedSession) void loadRequests(selectedSession);
    }, autoFetchInterval);
    return () => clearInterval(timer);
  }, [
    autoFetch,
    autoFetchInterval,
    loadSessions,
    loadRequests,
    selectedSession,
  ]);

  const onSelectSession = useCallback(
    (id: string) => {
      setSelectedSession(id);
      setSelectedFile(null);
      setDetail(null);
      setDetailError(null);
      void loadRequests(id);
    },
    [loadRequests],
  );

  const onSelectFile = useCallback(
    async (file: string) => {
      if (!selectedSession) return;
      setSelectedFile(file);
      setDetailLoading(true);
      setDetailError(null);
      try {
        setDetail(await api.request(selectedSession, file));
      } catch (e) {
        setDetailError(e instanceof Error ? e.message : String(e));
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [selectedSession],
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2">
        <div className="flex items-center gap-2">
          <Pulse size={16} weight="bold" className="text-accent" />
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            wiretap
          </span>
        </div>
        {logDir && (
          <span className="tnum truncate text-[13px] text-faint" title={logDir}>
            {logDir}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {!dbFound && (
            <span
              className="rounded px-1.5 py-0.5 text-[12px] text-block-tool-use"
              title="OpenCode DB not found — showing session ids instead of titles. Set OPENCODE_DB to override."
              style={{ backgroundColor: "var(--model-opus-bg)" }}
            >
              titles unavailable
            </span>
          )}
          {!pricingFound && (
            <span
              className="rounded px-1.5 py-0.5 text-[12px] text-block-tool-use"
              title="OpenCode's models.dev cache not found — costs unavailable. Set OPENCODE_MODELS to override."
              style={{ backgroundColor: "var(--model-opus-bg)" }}
            >
              costs unavailable
            </span>
          )}
          {costing && (
            <span
              className="tnum text-[13px] text-faint"
              title="costing captures in the background — session totals fill in as it goes"
            >
              costing {costing.done.toLocaleString()}
              {costing.total > 0 && ` / ${costing.total.toLocaleString()}`}
            </span>
          )}
          <span className="tnum text-[13px] text-faint">
            {sessions.length} sessions
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setAutoFetch(!autoFetch)}
            title={
              autoFetch
                ? "Auto-fetch on — click to disable"
                : "Auto-fetch off — click to enable"
            }
            aria-pressed={autoFetch}
            className={`flex items-center gap-1 rounded p-1.5 transition-colors hover:bg-elevated hover:text-ink active:translate-y-px ${
              autoFetch ? "text-accent" : "text-muted"
            }`}
          >
            <Timer size={15} weight="bold" />
          </button>
          {autoFetch && (
            <Select
              value={autoFetchInterval}
              onChange={setAutoFetchInterval}
              title="Auto-fetch interval"
              ariaLabel="Auto-fetch interval"
              options={INTERVAL_OPTIONS}
            />
          )}
        </div>
        <button
          onClick={toggleTheme}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          className="rounded p-1.5 text-muted transition-colors hover:bg-elevated hover:text-ink active:translate-y-px"
        >
          {theme === "dark" ? (
            <Sun size={15} weight="bold" />
          ) : (
            <Moon size={15} weight="bold" />
          )}
        </button>
      </header>

      {/* Widths are user-adjustable; the detail pane takes the remainder and
          the two splitters are keyboard-operable separators. */}
      <div ref={layoutRef} className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className="min-h-0 shrink-0 overflow-hidden"
          style={{
            width: sessionsCollapsed ? SESSIONS_RAIL : sessionsWidth,
          }}
        >
          <SessionsPane
            sessions={sessions}
            loading={sessionsLoading}
            error={sessionsError}
            selectedId={selectedSession}
            onSelect={onSelectSession}
            onRefresh={loadSessions}
            isCollapsed={sessionsCollapsed}
            onToggleCollapse={() => setSessionsCollapsed((v) => !v)}
          />
        </div>
        {!sessionsCollapsed && (
          <Splitter
            label="Resize sessions pane"
            value={sessionsWidth}
            min={SESSIONS_MIN}
            max={SESSIONS_MAX}
            onStart={(e) => startResize("sessions", e)}
            onMove={moveResize}
            onEnd={endResize}
            onReset={() => {
              remember("sessions", SESSIONS_DEFAULT);
              setSessionsWidth(SESSIONS_DEFAULT);
            }}
            onNudge={nudgeSessions}
          />
        )}
        <div
          className="min-h-0 shrink-0 overflow-hidden"
          style={{ width: requestsWidth }}
        >
          <RequestsPane
            sessionId={selectedSession}
            requests={requests}
            loading={requestsLoading}
            error={requestsError}
            selectedFile={selectedFile}
            onSelect={onSelectFile}
            onRefresh={() => selectedSession && loadRequests(selectedSession)}
          />
        </div>
        <Splitter
          label="Resize requests pane"
          value={requestsWidth}
          min={REQUESTS_MIN}
          max={REQUESTS_MAX}
          onStart={(e) => startResize("requests", e)}
          onMove={moveResize}
          onEnd={endResize}
          onReset={() => {
            remember("requests", REQUESTS_DEFAULT);
            setRequestsWidth(REQUESTS_DEFAULT);
          }}
          onNudge={nudgeRequests}
        />
        <div className="min-w-0 flex-1 overflow-hidden">
          <DetailPane
            data={detail}
            file={selectedFile}
            loading={detailLoading}
            error={detailError}
            cost={requests.find((r) => r.file === selectedFile)?.cost ?? null}
          />
        </div>
      </div>
    </div>
  );
}
