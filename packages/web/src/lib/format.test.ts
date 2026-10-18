import { expect, test } from "bun:test";
import { formatRequestTime, formatTokens } from "./format.ts";

test("formatTokens keeps small counts exact", () => {
  expect(formatTokens(0)).toBe("0");
  expect(formatTokens(999)).toBe("999");
});

test("formatTokens compacts thousands and millions", () => {
  expect(formatTokens(1_000)).toBe("1k");
  expect(formatTokens(14_933)).toBe("14.9k");
  expect(formatTokens(117_365)).toBe("117k");
  expect(formatTokens(1_420_816)).toBe("1.42M");
});

test("formatTokens renders unknown as absence", () => {
  expect(formatTokens(null)).toBe("—");
});

test("formatRequestTime shows a clock for today and a date otherwise", () => {
  expect(formatRequestTime("")).toBe("—");
  expect(formatRequestTime("not a date")).toBe("not a date");
  expect(formatRequestTime(new Date().toISOString())).toMatch(
    /^\d{2}:\d{2}:\d{2}$/,
  );
  expect(formatRequestTime(new Date(2020, 0, 2, 3, 4, 5).toISOString())).toBe(
    "01-02 03:04",
  );
});
