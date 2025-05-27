import { SQLValidator } from "@/lib/sql/transpile";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("SQLValidator", () => {
  it("should validate and transpile a simple query", () => {
    const validator = new SQLValidator();
    const result = validator.validateAndTranspile("SELECT * FROM spans", "123");
    assert.deepEqual(
      result,
      {
        valid: true,
        sql: 'SELECT * FROM "spans" WHERE "spans"."project_id" = $1',
        args: [
          {
            name: "project_id",
            value: "123",
          },
        ],
        error: null,
      }
    );
  });
});
