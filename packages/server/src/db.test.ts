import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readSessionMeta } from "./db.ts";
import type { SqliteDriver } from "./sqlite.ts";

/**
 * OpenCode 2.x migrated live sessions from `session` to `session_v2`. The
 * viewer must read both: v2 is authoritative, the legacy table keeps the
 * sessions that were never migrated.
 */
function memoryDb(sql: string): SqliteDriver {
  const db = new Database(":memory:");
  db.run(sql);
  return { all: (query, params) => db.query(query).all(...params) };
}

const COLUMNS = `(
  id TEXT PRIMARY KEY,
  title TEXT,
  parent_id TEXT,
  directory TEXT
)`;

describe("readSessionMeta", () => {
  test("prefers session_v2 and falls back to session for legacy ids", () => {
    const db = memoryDb(`
      CREATE TABLE session_v2 ${COLUMNS};
      CREATE TABLE session ${COLUMNS};

      INSERT INTO session_v2 VALUES
        ('ses_new',  'New title',    NULL,         'D:/new'),
        ('ses_both', 'V2 title',     NULL,         'D:/both'),
        ('ses_null', NULL,           NULL,         NULL);

      INSERT INTO session VALUES
        ('ses_old',  'Legacy title', NULL,         'D:/old'),
        ('ses_both', 'Legacy title', NULL,         'D:/old'),
        ('ses_null', 'Legacy title', 'ses_parent', 'D:/old');
    `);

    const meta = readSessionMeta(db, [
      "ses_new",
      "ses_old",
      "ses_both",
      "ses_null",
      "ses_missing",
    ]);

    expect(meta.get("ses_new")).toEqual({
      title: "New title",
      parentId: null,
      directory: "D:/new",
    });
    expect(meta.get("ses_old")).toEqual({
      title: "Legacy title",
      parentId: null,
      directory: "D:/old",
    });
    // A migrated row wins even when the legacy table still has it.
    expect(meta.get("ses_both")?.title).toBe("V2 title");
    // A null v2 field should not hide a value the legacy row still has.
    expect(meta.get("ses_null")).toEqual({
      title: "Legacy title",
      parentId: "ses_parent",
      directory: "D:/old",
    });
    expect(meta.has("ses_missing")).toBe(false);
  });

  test("works against a pre-V2 database with only the session table", () => {
    const db = memoryDb(`
      CREATE TABLE session ${COLUMNS};
      INSERT INTO session VALUES
        ('ses_old', 'Legacy title', NULL, 'D:/old');
    `);

    expect(readSessionMeta(db, ["ses_old"]).get("ses_old")).toEqual({
      title: "Legacy title",
      parentId: null,
      directory: "D:/old",
    });
  });
});
