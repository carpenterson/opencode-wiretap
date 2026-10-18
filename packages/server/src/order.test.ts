import { describe, expect, test } from "bun:test";
import { orderRequests } from "./order.ts";

describe("orderRequests", () => {
  test("sorts by filename and renumbers from one", () => {
    const rows = [
      { file: "2026-10-18T05-24-21-316Z_0066.json", seq: 66 },
      { file: "2026-10-18T09-12-49-413Z_0066.json", seq: 66 },
      { file: "2026-10-18T05-24-24-433Z_0067.json", seq: 67 },
    ];

    expect(orderRequests(rows).map((r) => [r.file, r.seq])).toEqual([
      ["2026-10-18T05-24-21-316Z_0066.json", 1],
      ["2026-10-18T05-24-24-433Z_0067.json", 2],
      ["2026-10-18T09-12-49-413Z_0066.json", 3],
    ]);
  });

  test("does not mutate the input rows", () => {
    const rows = [{ file: "2026-10-18T05-24-21-316Z_0009.json", seq: 9 }];

    const ordered = orderRequests(rows);

    expect(rows[0]!.seq).toBe(9);
    expect(ordered[0]!.seq).toBe(1);
  });
});
