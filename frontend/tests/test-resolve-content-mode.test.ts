import assert from "node:assert/strict";
import { describe, it } from "node:test";

import YAML from "yaml";

import { resolveContentMode } from "@/lib/spans/resolve-content-mode";

describe("resolveContentMode", () => {
  it("defaults object payloads to YAML, keeping JSON in the picker", () => {
    assert.deepEqual(resolveContentMode({ a: 1 }), {
      mode: "yaml",
      modes: ["YAML", "JSON"],
      value: '{\n  "a": 1\n}',
    });
  });

  it("defaults JSON-stringified object payloads to YAML", () => {
    assert.deepEqual(resolveContentMode('{"a":1}'), {
      mode: "yaml",
      modes: ["YAML", "JSON"],
      value: '{\n  "a": 1\n}',
    });
  });

  it("emits a value YAML mode can render losslessly", () => {
    // `renderText("yaml", …)` is YAML.stringify(YAML.parse(value)), so the value must
    // stay valid YAML. JSON is a YAML subset, and multi-line strings survive as `|-`
    // literal blocks rather than being folded.
    const payload = { prompt: "line one\n  indented two\nline three", n: 1 };
    const { value } = resolveContentMode(payload);

    const rendered = YAML.stringify(YAML.parse(value));
    assert.match(rendered, /prompt: \|-/);
    assert.deepEqual(YAML.parse(rendered), payload);
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

  it("keeps free-form content on TEXT, because YAML mode mangles prose", () => {
    const prose = "# Heading\n\nSome prose.";
    const { mode, modes } = resolveContentMode(prose);

    assert.equal(mode, "text");
    assert.deepEqual(modes, ["TEXT", "YAML"]);

    // Why text is the default and not yaml: YAML treats `#` as a comment, so rendering
    // this as YAML silently drops the heading entirely.
    assert.doesNotMatch(YAML.stringify(YAML.parse(prose)), /Heading/);
  });

  it("coerces null and undefined to an empty string instead of rendering 'null'", () => {
    assert.equal(resolveContentMode(null).value, "");
    assert.equal(resolveContentMode(undefined).value, "");
  });
});
