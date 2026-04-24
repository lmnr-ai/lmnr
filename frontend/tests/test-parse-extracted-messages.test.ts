import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseExtractedMessages } from "@/lib/actions/sessions/parse-input";

describe("parseExtractedMessages", () => {
  it("extracts system + first user from OTel GenAI parts format", () => {
    const system = JSON.stringify({
      role: "system",
      parts: [{ type: "text", content: "You are a helpful assistant." }],
    });
    const user = JSON.stringify({
      role: "user",
      parts: [{ type: "text", content: "What's the weather in SF?" }],
    });

    const result = parseExtractedMessages(system, user);
    assert.ok(result, "expected non-null result");
    assert.strictEqual(result.systemText, "You are a helpful assistant.");
    assert.deepStrictEqual(result.userParts, [{ text: "What's the weather in SF?" }]);
  });

  it("joins multiple text parts in a single GenAI message with newlines", () => {
    const system = JSON.stringify({
      role: "system",
      parts: [
        { type: "text", content: "Part A" },
        { type: "text", content: "Part B" },
      ],
    });
    const user = JSON.stringify({
      role: "user",
      parts: [
        { type: "text", content: "Line 1" },
        { type: "text", content: "Line 2" },
      ],
    });

    const result = parseExtractedMessages(system, user);
    assert.ok(result);
    assert.strictEqual(result.systemText, "Part A\nPart B");
    assert.deepStrictEqual(result.userParts, [{ text: "Line 1" }, { text: "Line 2" }]);
  });

  it("skips non-text GenAI parts (tool_call, uri, blob, thinking)", () => {
    const system = JSON.stringify({
      role: "system",
      parts: [{ type: "text", content: "Be helpful." }],
    });
    const user = JSON.stringify({
      role: "user",
      parts: [
        { type: "text", content: "Describe this image:" },
        { type: "uri", uri: "https://example.com/a.png", mime_type: "image/png" },
        { type: "thinking", content: "internal reasoning" },
      ],
    });

    const result = parseExtractedMessages(system, user);
    assert.ok(result);
    assert.strictEqual(result.systemText, "Be helpful.");
    assert.deepStrictEqual(result.userParts, [{ text: "Describe this image:" }]);
  });

  it("treats bare-string GenAI parts as implicit text (system_instructions shape)", () => {
    const system = JSON.stringify({ role: "system", parts: ["Be concise"] });
    const user = JSON.stringify({
      role: "user",
      parts: [{ type: "text", content: "Hi" }],
    });

    const result = parseExtractedMessages(system, user);
    assert.ok(result);
    assert.strictEqual(result.systemText, "Be concise");
    assert.deepStrictEqual(result.userParts, [{ text: "Hi" }]);
  });

  it("returns empty userParts when GenAI input has no user message", () => {
    const system = JSON.stringify({
      role: "system",
      parts: [{ type: "text", content: "System only." }],
    });
    const assistant = JSON.stringify({
      role: "assistant",
      parts: [{ type: "text", content: "I replied." }],
    });

    const result = parseExtractedMessages(system, assistant);
    assert.ok(result);
    assert.strictEqual(result.systemText, "System only.");
    assert.deepStrictEqual(result.userParts, []);
  });

  it("does not misidentify Gemini-shaped data as GenAI", () => {
    // Gemini uses `{text: "..."}` parts (no `type` discriminator) — the GenAI
    // detection gate should reject this and let the Gemini extractor handle it.
    const system = JSON.stringify({
      role: "system",
      parts: [{ text: "Gemini system" }],
    });
    const user = JSON.stringify({
      role: "user",
      parts: [{ text: "Gemini user" }],
    });

    const result = parseExtractedMessages(system, user);
    assert.ok(result);
    assert.strictEqual(result.systemText, "Gemini system");
    assert.deepStrictEqual(result.userParts, [{ text: "Gemini user" }]);
  });

  it("still handles OpenAI-shaped data with `content` field", () => {
    const system = JSON.stringify({ role: "system", content: "OpenAI system" });
    const user = JSON.stringify({ role: "user", content: "OpenAI user" });

    const result = parseExtractedMessages(system, user);
    assert.ok(result);
    assert.strictEqual(result.systemText, "OpenAI system");
    assert.deepStrictEqual(result.userParts, [{ text: "OpenAI user" }]);
  });
});
