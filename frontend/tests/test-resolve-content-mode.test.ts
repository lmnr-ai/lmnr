import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveContentMode } from "@/lib/spans/resolve-content-mode";

describe("resolveContentMode", () => {
  it("pretty-prints object payloads as JSON", () => {
    assert.deepEqual(resolveContentMode({ a: 1 }), { mode: "json", modes: ["JSON"], value: '{\n  "a": 1\n}' });
  });

  it("pretty-prints JSON-stringified object payloads as JSON", () => {
    assert.deepEqual(resolveContentMode('{"a":1}'), { mode: "json", modes: ["JSON"], value: '{\n  "a": 1\n}' });
  });

  it("unwraps JSON-stringified string payloads so escapes do not leak into the text view", () => {
    // Span payloads arrive double-encoded, and text mode shows the value verbatim.
    const { mode, value } = resolveContentMode(JSON.stringify("line 1\nline 2"));

    assert.equal(mode, "text");
    assert.equal(value, "line 1\nline 2");
  });

  it("preserves indentation in prompt-shaped content verbatim", () => {
    const schema = '<output_schema>\n{\n  "type": "object",\n    "deep": 1\n}\n</output_schema>';

    assert.equal(resolveContentMode(schema).value, schema);
  });

  it("renders prose as text — markdown is no longer a span-view mode", () => {
    const { mode, modes } = resolveContentMode("# Heading\n\nSome prose.");

    assert.equal(mode, "text");
    assert.deepEqual(modes, ["TEXT"]);
  });

  it("coerces null and undefined to an empty string instead of rendering 'null'", () => {
    assert.equal(resolveContentMode(null).value, "");
    assert.equal(resolveContentMode(undefined).value, "");
  });
});
