import { SQLValidator } from "@/lib/sql/transpile";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("SQLValidator", () => {
  it("should validate and transpile a simple query", () => {
    const validator = new SQLValidator();
    const result = validator.validateAndTranspile("SELECT * FROM spans", "123");
    assert.strictEqual(result.valid, true);
    assert.ok(
      result.sql?.endsWith(
        'SELECT * FROM "spans" WHERE "spans"."project_id" = $1 LIMIT 100'
      )
    );
    assert.deepStrictEqual(result.args, [
      {
        name: "project_id",
        value: "123",
      },
    ]);
    assert.strictEqual(result.error, null);
    assert.deepStrictEqual(result.warnings, [
      'A limit of 100 was applied to the query for performance reasons. ' +
      'Add an explicit limit to see more results.',
    ]);
  });
});
