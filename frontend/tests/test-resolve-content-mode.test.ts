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
    // Span payloads arrive double-encoded. The markdown branch used to unwrap this via
    // `getMarkdownSource`; text mode shows the value verbatim, so it must be unwrapped here.
    const { mode, value } = resolveContentMode(JSON.stringify("line 1\nline 2"));

    assert.equal(mode, "text");
    assert.equal(value, "line 1\nline 2");
  });

  it("preserves indentation in prompt-shaped content verbatim", () => {
    const schema = '<output_schema>\n{\n  "type": "object",\n    "deep": 1\n}\n</output_schema>';

    assert.equal(resolveContentMode(schema).value, schema);
  });

  it("defaults prose to text while keeping markdown reachable in the picker", () => {
    const { mode, modes } = resolveContentMode("# Heading\n\nSome prose.");

    assert.equal(mode, "text");
    assert.deepEqual(modes, ["TEXT", "MARKDOWN"]);
  });

  it("coerces null and undefined to an empty string instead of rendering 'null'", () => {
    assert.equal(resolveContentMode(null).value, "");
    assert.equal(resolveContentMode(undefined).value, "");
  });
});
