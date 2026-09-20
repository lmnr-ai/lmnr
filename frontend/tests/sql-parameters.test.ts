import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deriveParameters,
  findParameterRefs,
  formatParameterDisplay,
  formatParameters,
  inferParameterType,
} from "@/components/sql/parameters";

const names = (sql: string) => findParameterRefs(sql).map((ref) => ref.name);

describe("findParameterRefs", () => {
  it("finds placeholders and reports the span the decoration paints", () => {
    const sql = "SELECT * FROM traces WHERE start_time >= {start_time:DateTime64}";
    const [ref] = findParameterRefs(sql);
    assert.strictEqual(ref.name, "start_time");
    assert.strictEqual(ref.declaredType, "DateTime64");
    assert.strictEqual(sql.slice(ref.from, ref.to), "{start_time:DateTime64}");
  });

  it("tolerates whitespace around the name and type", () => {
    assert.deepStrictEqual(names("WHERE id = { endDate : String }"), ["endDate"]);
  });

  it("keeps parens, commas and quotes inside the declared type", () => {
    const refs = findParameterRefs("WHERE ts >= {ts:DateTime64(9, 'UTC')} AND id IN ({ids:Array(UUID)})");
    assert.deepStrictEqual(
      refs.map((ref) => ref.declaredType),
      ["DateTime64(9, 'UTC')", "Array(UUID)"]
    );
  });

  it("ignores braces inside string literals", () => {
    assert.deepStrictEqual(names("WHERE body LIKE '%{fake:String}%'"), []);
    assert.deepStrictEqual(names(`WHERE attributes = '{"k":1}'`), []);
  });

  it("does not let a doubled quote close a string early", () => {
    assert.deepStrictEqual(names("WHERE name = 'it''s {fake:String}'"), []);
  });

  it("ignores braces inside line and block comments", () => {
    assert.deepStrictEqual(names("-- {fake:String}\nSELECT {real:String}"), ["real"]);
    assert.deepStrictEqual(names("/* {fake:String} */ SELECT {real:String}"), ["real"]);
  });

  it("resumes scanning after a string literal ends", () => {
    assert.deepStrictEqual(names("WHERE name = 'x' AND ts >= {start_time:DateTime64}"), ["start_time"]);
  });

  it("does not match a brace pair spanning lines", () => {
    assert.deepStrictEqual(names("SELECT {\n  a: b\n}"), []);
  });

  it("reports every occurrence, duplicates included", () => {
    assert.deepStrictEqual(names("{a:String} {b:UInt64} {a:String}"), ["a", "b", "a"]);
  });
});

describe("inferParameterType", () => {
  it("maps date-like types to a date picker", () => {
    for (const type of ["Date", "Date32", "DateTime", "DateTime64", "DateTime64(9, 'UTC')"]) {
      assert.strictEqual(inferParameterType(type), "date", type);
    }
  });

  it("maps numeric types to a number input", () => {
    for (const type of ["UInt8", "Int64", "Float64", "Decimal(10, 2)"]) {
      assert.strictEqual(inferParameterType(type), "number", type);
    }
  });

  it("unwraps Nullable and LowCardinality", () => {
    assert.strictEqual(inferParameterType("Nullable(DateTime64)"), "date");
    assert.strictEqual(inferParameterType("LowCardinality(String)"), "string");
  });

  it("falls back to text for anything else", () => {
    for (const type of ["String", "UUID", "Array(UUID)", "Bool"]) {
      assert.strictEqual(inferParameterType(type), "string", type);
    }
  });
});

describe("deriveParameters", () => {
  it("returns parameters in first-appearance order with their stored values", () => {
    const { parameters } = deriveParameters("SELECT {b:String}, {a:UInt64}", { a: 7, b: "x" });
    assert.deepStrictEqual(
      parameters.map((p) => [p.name, p.type, p.value]),
      [
        ["b", "string", "x"],
        ["a", "number", 7],
      ]
    );
  });

  it("seeds a referenced parameter with no stored value as unset", () => {
    const { parameters } = deriveParameters("SELECT {customer_id:String}", {});
    assert.deepStrictEqual(parameters, [
      { name: "customer_id", declaredType: "String", type: "string", value: undefined },
    ]);
  });

  it("drops a parameter the query no longer references", () => {
    const { parameters } = deriveParameters("SELECT 1", { start_time: new Date() });
    assert.deepStrictEqual(parameters, []);
  });

  it("carries a stored date over when the query retypes the parameter as a string", () => {
    const { parameters } = deriveParameters("SELECT {start_time:String}", {
      start_time: new Date("2026-09-11T00:00:00.000Z"),
    });
    assert.strictEqual(parameters[0].type, "string");
    assert.match(String(parameters[0].value), /^2026-09-1[01] /);
  });

  it("reports a name declared under two types and binds the first", () => {
    const { parameters, conflicts } = deriveParameters("SELECT {x:String}, {x:UInt64}", { x: "v" });
    assert.strictEqual(parameters.length, 1);
    assert.strictEqual(parameters[0].declaredType, "String");
    assert.deepStrictEqual(conflicts, { x: ["String", "UInt64"] });
  });

  it("does not report a conflict for a name repeated with the same type", () => {
    const { conflicts } = deriveParameters("SELECT {x:String}, {x:String}", {});
    assert.deepStrictEqual(conflicts, {});
  });
});

describe("formatParameters", () => {
  it("sends dates in the ClickHouse DateTime64 literal format", () => {
    const { parameters } = deriveParameters("SELECT {start_time:DateTime64}", {
      start_time: new Date(2026, 8, 11, 13, 45, 30, 120),
    });
    assert.deepStrictEqual(formatParameters(parameters), { start_time: "2026-09-11 13:45:30.120" });
  });

  it("omits an unset parameter rather than sending an empty value", () => {
    const { parameters } = deriveParameters("SELECT {a:String}, {b:UInt64}", { a: "x" });
    assert.deepStrictEqual(formatParameters(parameters), { a: "x" });
  });

  it("keeps an explicitly empty string, which is a value", () => {
    const { parameters } = deriveParameters("SELECT {a:String}", { a: "" });
    assert.deepStrictEqual(formatParameters(parameters), { a: "" });
  });
});

describe("formatParameterDisplay", () => {
  // Only the misleading case is pinned. The exact chip wording is cosmetic and has already changed
  // twice; asserting it would just break on the next tweak.
  it("abbreviates a date only when the year is unambiguous", () => {
    const thisYear = new Date().getFullYear();
    const display = (value: Date) => formatParameterDisplay({ name: "d", type: "date", value });

    assert.ok(!display(new Date(thisYear, 8, 11))?.includes(String(thisYear)));
    assert.ok(display(new Date(2021, 8, 11))?.includes("2021"));
  });
});
