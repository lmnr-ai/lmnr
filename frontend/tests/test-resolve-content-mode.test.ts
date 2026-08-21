import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveContentMode } from "@/lib/spans/resolve-content-mode";

describe("resolveContentMode", () => {
  it("defaults object payloads to JSON with a single mode so the part picker stays hidden", () => {
    assert.deepEqual(resolveContentMode({ a: 1 }), {
      mode: "json",
      modes: ["JSON"],
      value: '{\n  "a": 1\n}',
    });
  });

  it("defaults JSON-stringified object payloads to JSON", () => {
    assert.deepEqual(resolveContentMode('{"a":1}'), {
      mode: "json",
      modes: ["JSON"],
      value: '{\n  "a": 1\n}',
    });
  });

  it("pretty-prints structured payloads", () => {
    const payload = { prompt: "line one\n  indented two\nline three", n: 1 };
    assert.equal(resolveContentMode(payload).value, JSON.stringify(payload, null, 2));
  });

  it("unwraps JSON-stringified string payloads so escapes do not leak into the text view", () => {
    const { mode, value } = resolveContentMode(JSON.stringify("line 1\nline 2"));

    assert.equal(mode, "text");
    assert.equal(value, "line 1\nline 2");
  });

  it("preserves indentation in prompt-shaped content verbatim", () => {
    const schema = '<output_schema>\n{\n  "type": "object",\n    "deep": 1\n}\n</output_schema>';

    assert.equal(resolveContentMode(schema).value, schema);
  });

  it("keeps free-form content on TEXT", () => {
    const prose = "# Heading\n\nSome prose.";
    const { mode, modes } = resolveContentMode(prose);

    assert.equal(mode, "text");
    assert.deepEqual(modes, ["TEXT"]);
  });

  it("coerces null and undefined to an empty string instead of rendering 'null'", () => {
    assert.equal(resolveContentMode(null).value, "");
    assert.equal(resolveContentMode(undefined).value, "");
  });
});
