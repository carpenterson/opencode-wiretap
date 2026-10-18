import path from "node:path";
import os from "node:os";
import { existsSync } from "node:fs";
import { openReadonly, type SqliteDriver } from "./sqlite.ts";

/**
 * Read-only access to OpenCode's SQLite database to resolve session titles.
 *
 * OpenCode stores session metadata (title, parent, directory) in
 * `~/.local/share/opencode/opencode.db` (see opencode
 * packages/core/src/database/database.ts → join(Global.Path.data, "opencode.db")).
 * The DB runs in WAL mode, so a read-only connection is safe to open
 * concurrently while OpenCode is running. We only issue indexed primary-key
 * lookups, so the multi-GB file size is irrelevant to performance.
 */

const DEFAULT_DB = path.join(os.homedir(), ".local/share/opencode/opencode.db");

/**
 * Resolve the DB path: OPENCODE_DB (absolute) overrides the XDG default.
 * Read lazily, not at import time, so CLI flags can set OPENCODE_DB first.
 */
export function dbPath(): string {
  return process.env.OPENCODE_DB
    ? path.resolve(process.env.OPENCODE_DB)
    : DEFAULT_DB;
}

export interface SessionMeta {
  title: string | null;
  parentId: string | null;
  directory: string | null;
}

let opening: Promise<SqliteDriver | null> | null = null;

/** Lazily open the DB read-only, once. Resolves to null if unavailable. */
function getDb(): Promise<SqliteDriver | null> {
  const file = dbPath();
  opening ??= existsSync(file) ? openReadonly(file) : Promise.resolve(null);
  return opening;
}

/** True if the OpenCode DB was found and opened. */
export async function dbAvailable(): Promise<boolean> {
  return (await getDb()) !== null;
}

// SQLite limits bound variables (default 999). Chunk well under that.
const CHUNK = 900;

/**
 * OpenCode 2.x moved live sessions from `session` to `session_v2`; the legacy
 * table still holds sessions that were never migrated. Read both, newest
 * schema first.
 */
const SESSION_TABLES = ["session_v2", "session"] as const;
const SESSION_COLUMNS = "id, title, parent_id AS parentId, directory";

interface SessionRow {
  id: string;
  title: string | null;
  parentId: string | null;
  directory: string | null;
}

function sessionRows(
  conn: SqliteDriver,
  table: string,
  ids: string[],
): SessionRow[] {
  const placeholders = ids.map(() => "?").join(",");
  return conn.all(
    `SELECT ${SESSION_COLUMNS} FROM ${table} WHERE id IN (${placeholders})`,
    ids,
  ) as SessionRow[];
}

/**
 * Merge a chunk of ids from both session tables into one metadata map. A
 * value from `session_v2` wins; the legacy row fills in anything v2 left
 * null. Exported for tests — `getSessionMeta` is the production entry point.
 */
export function readSessionMeta(
  conn: SqliteDriver,
  ids: string[],
): Map<string, SessionMeta> {
  const out = new Map<string, SessionMeta>();

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const byTable = new Map<string, Map<string, SessionRow>>();

    for (const table of SESSION_TABLES) {
      try {
        const rows = sessionRows(conn, table, chunk);
        byTable.set(table, new Map(rows.map((r) => [r.id, r])));
      } catch {
        // Pre-V2 databases have no session_v2 table; schema drift on either
        // table just means that table contributes nothing.
      }
    }

    const live = byTable.get("session_v2");
    const legacy = byTable.get("session");
    for (const id of chunk) {
      const v2 = live?.get(id);
      const v1 = legacy?.get(id);
      if (!v2 && !v1) continue;
      out.set(id, {
        title: v2?.title ?? v1?.title ?? null,
        parentId: v2?.parentId ?? v1?.parentId ?? null,
        directory: v2?.directory ?? v1?.directory ?? null,
      });
    }
  }

  return out;
}

/**
 * Batch-resolve session metadata by id. Missing ids and any DB error degrade
 * gracefully to an empty map (callers fall back to id-only display).
 */
export async function getSessionMeta(
  ids: string[],
): Promise<Map<string, SessionMeta>> {
  if (ids.length === 0) return new Map();
  const conn = await getDb();
  if (!conn) return new Map();

  try {
    return readSessionMeta(conn, ids);
  } catch {
    // Schema drift or read error — return whatever we gathered.
    return new Map();
  }
}
