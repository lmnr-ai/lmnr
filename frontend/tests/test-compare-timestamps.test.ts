import assert from "node:assert";
import { describe, it } from "node:test";

import { compareTimestamps } from "../lib/utils";

describe("compareTimestamps", () => {
  it("returns negative when a is before b (different seconds)", () => {
    const a = "2025-01-01T00:00:01.000000Z";
    const b = "2025-01-01T00:00:02.000000Z";
    assert.ok(compareTimestamps(a, b) < 0);
  });

  it("returns positive when a is after b (different seconds)", () => {
    const a = "2025-01-01T00:00:02.000000Z";
    const b = "2025-01-01T00:00:01.000000Z";
    assert.ok(compareTimestamps(a, b) > 0);
  });

  it("returns 0 for identical timestamps", () => {
    const a = "2025-01-01T00:00:01.123456Z";
    assert.strictEqual(compareTimestamps(a, a), 0);
  });

  it("correctly orders timestamps differing only in microseconds", () => {
    const a = "2025-01-01T00:00:01.123232Z";
    const b = "2025-01-01T00:00:01.123689Z";
    // These have the same millisecond (123) but differ in microseconds
    assert.ok(compareTimestamps(a, b) < 0);
    assert.ok(compareTimestamps(b, a) > 0);
  });

  it("correctly orders timestamps differing only in sub-millisecond digits", () => {
    const a = "2025-01-01T00:00:01.629232Z";
    const b = "2025-01-01T00:00:01.629689Z";
    // Both parse to the same millisecond (629ms) with new Date()
    assert.ok(compareTimestamps(a, b) < 0);
    assert.ok(compareTimestamps(b, a) > 0);
  });

  it("correctly orders timestamps with nanosecond precision", () => {
    const a = "2025-01-01T00:00:01.123456789Z";
    const b = "2025-01-01T00:00:01.123456790Z";
    assert.ok(compareTimestamps(a, b) < 0);
    assert.ok(compareTimestamps(b, a) > 0);
  });

  it("handles mixed precision (microseconds vs nanoseconds)", () => {
    const a = "2025-01-01T00:00:01.123456Z"; // 6 digits
    const b = "2025-01-01T00:00:01.123456001Z"; // 9 digits, slightly after
    assert.ok(compareTimestamps(a, b) < 0);
  });

  it("handles millisecond-only timestamps", () => {
    const a = "2025-01-01T00:00:01.123Z";
    const b = "2025-01-01T00:00:01.124Z";
    assert.ok(compareTimestamps(a, b) < 0);
  });

  it("treats equal milliseconds with no extra digits as equal", () => {
    const a = "2025-01-01T00:00:01.123Z";
    const b = "2025-01-01T00:00:01.123Z";
    assert.strictEqual(compareTimestamps(a, b), 0);
  });

  it("produces stable sort for real-world ClickHouse timestamps", () => {
    // Simulates spans from the same trace with close timestamps
    const timestamps = [
      "2026-02-24T22:02:35.629689Z",
      "2026-02-24T22:02:35.629232Z",
      "2026-02-24T22:02:37.794992Z",
      "2026-02-24T22:02:37.794451Z",
      "2026-02-24T22:02:21.804989Z",
    ];

    const sorted = [...timestamps].sort(compareTimestamps);

    assert.deepStrictEqual(sorted, [
      "2026-02-24T22:02:21.804989Z",
      "2026-02-24T22:02:35.629232Z",
      "2026-02-24T22:02:35.629689Z",
      "2026-02-24T22:02:37.794451Z",
      "2026-02-24T22:02:37.794992Z",
    ]);
  });

  it("sort is deterministic across multiple runs", () => {
    const timestamps = [
      "2025-01-01T00:00:01.123456Z",
      "2025-01-01T00:00:01.123789Z",
      "2025-01-01T00:00:01.123100Z",
      "2025-01-01T00:00:01.123999Z",
      "2025-01-01T00:00:01.123001Z",
    ];

    const expected = [
      "2025-01-01T00:00:01.123001Z",
      "2025-01-01T00:00:01.123100Z",
      "2025-01-01T00:00:01.123456Z",
      "2025-01-01T00:00:01.123789Z",
      "2025-01-01T00:00:01.123999Z",
    ];

    // Run the sort 10 times to verify determinism
    for (let i = 0; i < 10; i++) {
      const sorted = [...timestamps].sort(compareTimestamps);
      assert.deepStrictEqual(sorted, expected, `Sort was not deterministic on run ${i + 1}`);
    }
  });
});
