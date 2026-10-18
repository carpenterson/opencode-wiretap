import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "wiretap-write-"));
process.env.XDG_CONFIG_HOME = root;

const { logRoot, writeRequest } = await import("./write.ts");

afterAll(() => rmSync(root, { recursive: true, force: true }));

function seqOf(file: string | null): number {
  const m = file ? /_(\d+)\.json$/.exec(file) : null;
  return m ? Number(m[1]) : Number.NaN;
}

const URL = "https://api.example.invalid/v1/messages";

describe("writeRequest", () => {
  test("continues numbering from captures already on disk", () => {
    // Simulates the plugin being reloaded mid-session: the in-memory counter
    // is gone, but earlier captures are still in the session directory.
    const dir = join(logRoot(), "ses_resume");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "2026-01-01T00-00-00-000Z_0041.json"), "{}");

    const file = writeRequest("ses_resume", URL, { model: "test" });

    expect(file).not.toBeNull();
    expect(seqOf(file)).toBe(42);
  });

  test("increments for consecutive writes", () => {
    const first = writeRequest("ses_consecutive", URL, {});
    const second = writeRequest("ses_consecutive", URL, {});

    expect(seqOf(second) - seqOf(first)).toBe(1);
  });

  test("numbers each session independently", () => {
    const a = writeRequest("ses_a", URL, {});
    const b = writeRequest("ses_b", URL, {});

    expect(seqOf(a)).toBe(0);
    expect(seqOf(b)).toBe(0);
  });
});
