import { generateSequentialUuidsV7 } from "@/lib/utils";
import { describe, it } from "node:test";
import { v7 as uuidv7, parse as uuidParse, stringify as uuidStringify } from "uuid";

import assert from "node:assert/strict";

describe("generateSequentialUuidsV7", () => {
  it("generates sequential UUIDs", () => {
    const uuids = generateSequentialUuidsV7(10);
    assert.strictEqual(uuids.length, 10);

    // Since byte-sorted UUIDs are also lexicographically sorted as strings,
    // we can verify correctness by comparing with a simple string sort
    const lexicographicallySorted = [...uuids].sort();
    assert.deepStrictEqual(uuids, lexicographicallySorted);
  });

  it("handles large batches with many UUIDs in same millisecond", () => {
    // Generate many UUIDs quickly - likely to have timestamp collisions
    const uuids = generateSequentialUuidsV7(1000);
    assert.strictEqual(uuids.length, 1000);

    // Verify all UUIDs are unique
    const uniqueUuids = new Set(uuids);
    assert.strictEqual(uniqueUuids.size, 1000, "All UUIDs should be unique");

    // Verify sorted order
    const lexicographicallySorted = [...uuids].sort();
    assert.deepStrictEqual(uuids, lexicographicallySorted);
  });

  it("handles edge cases", () => {
    assert.deepStrictEqual(generateSequentialUuidsV7(0), []);
    assert.strictEqual(generateSequentialUuidsV7(1).length, 1);
    assert.deepStrictEqual(generateSequentialUuidsV7(-5), []);
  });

  it("generates valid UUIDv7 format", () => {
    const uuids = generateSequentialUuidsV7(5);
    const uuidv7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    for (const uuid of uuids) {
      assert.match(uuid, uuidv7Pattern, `UUID ${uuid} should match UUIDv7 format`);
    }
  });
});
