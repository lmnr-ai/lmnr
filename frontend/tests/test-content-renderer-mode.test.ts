import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pickMode } from "@/components/ui/content-renderer/mode";

describe("pickMode", () => {
  it("falls back to text when localStorage still holds the removed markdown mode", () => {
    // Users who selected markdown before it was removed still have
    // `formatter-mode-${presetKey}` set to "markdown" — it must never win.
    assert.equal(pickMode("markdown", ["TEXT"], "text"), "text");
    assert.equal(pickMode("markdown", ["TEXT", "YAML", "JSON", "CUSTOM"], "text"), "text");
    assert.equal(pickMode("markdown", ["JSON"], "json"), "json");
  });

  it("honours a persisted mode that is still offered", () => {
    assert.equal(pickMode("yaml", ["TEXT", "YAML", "JSON"], "text"), "yaml");
  });

  it("normalizes case, since modes are stored lowercase but listed uppercase", () => {
    assert.equal(pickMode("JSON", ["TEXT", "JSON"], "text"), "json");
  });

  it("falls back when nothing is persisted", () => {
    assert.equal(pickMode(null, ["TEXT"], "text"), "text");
    assert.equal(pickMode(undefined, ["TEXT"], "text"), "text");
    assert.equal(pickMode("", ["TEXT"], "text"), "text");
  });

  it("falls back when the mode list changes under a mounted instance", () => {
    // Virtualized rows reuse ContentRenderer across spans, so a JSON payload can
    // replace a text one while "text" is still selected.
    assert.equal(pickMode("text", ["JSON"], "json"), "json");
  });
});
