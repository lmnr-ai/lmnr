import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAiSdkMessages } from "@/lib/spans/types/ai-sdk";
import { parseGenAIMessages } from "@/lib/spans/types/gen-ai";
import { normalizeToMessages } from "@/lib/spans/types/index";

describe("normalizeToMessages", () => {
  it("wraps a single message object (GenAI output) into an array", () => {
    const output = { role: "assistant", parts: [{ type: "tool_call", id: "t1", name: "regex", arguments: {} }] };
    assert.deepStrictEqual(normalizeToMessages(output), [output]);
  });

  it("wraps a single AI-SDK-style message object into an array", () => {
    const msg = { role: "assistant", content: [{ type: "tool-call", toolCallId: "c1", toolName: "t", input: {} }] };
    assert.deepStrictEqual(normalizeToMessages(msg), [msg]);
  });

  it("wraps a bare AI-SDK parts array as one message with an inferred assistant role", () => {
    const parts = [
      { type: "reasoning", text: "" },
      { type: "tool-call", toolCallId: "c1", toolName: "regex", input: { r: 1 } },
    ];
    assert.deepStrictEqual(normalizeToMessages(parts), [{ role: "assistant", content: parts }]);
  });

  it("infers the tool role for a bare tool-result parts array", () => {
    const parts = [{ type: "tool-result", toolCallId: "c1", toolName: "t", output: { type: "text", value: "ok" } }];
    assert.deepStrictEqual(normalizeToMessages(parts), [{ role: "tool", content: parts }]);
  });

  it("infers the user role for a bare text/image parts array", () => {
    const parts = [
      { type: "text", text: "hi" },
      { type: "image", image: "https://example.com/x.png" },
    ];
    assert.deepStrictEqual(normalizeToMessages(parts), [{ role: "user", content: parts }]);
  });

  it("leaves an existing message array unchanged", () => {
    const messages = [
      { role: "user", content: "hi" },
      { role: "assistant", content: [{ type: "text", text: "hello" }] },
    ];
    assert.strictEqual(normalizeToMessages(messages), messages);
  });

  it("is a no-op for strings, empty arrays, and non-message objects", () => {
    assert.strictEqual(normalizeToMessages("plain text"), "plain text");
    const empty: unknown[] = [];
    assert.strictEqual(normalizeToMessages(empty), empty);
    const notAMessage = { foo: 1 };
    assert.strictEqual(normalizeToMessages(notAMessage), notAMessage);
  });

  it("end-to-end: a bare AI-SDK parts array becomes an assistant message the AI-SDK parser claims", () => {
    const parts = [
      { type: "reasoning", text: "" },
      { type: "tool-call", toolCallId: "toolu_1", toolName: "regex", input: { regexes: ["a"] } },
    ];
    const normalized = normalizeToMessages(parts);
    const result = parseAiSdkMessages(normalized);
    assert.ok(result, "expected the wrapped bare parts to be claimed by the AI-SDK parser");
    assert.strictEqual(result[0].role, "assistant");
    const content = result[0].content as any[];
    // Empty reasoning is dropped; the tool-call survives.
    assert.strictEqual(content.length, 1);
    assert.strictEqual(content[0].type, "tool-call");
  });

  it("end-to-end: a single GenAI message object becomes an array the GenAI parser claims with a role", () => {
    const output = {
      role: "assistant",
      parts: [{ type: "tool_call", id: "toolu_2", name: "regex", arguments: { regexes: ["b"] } }],
    };
    const normalized = normalizeToMessages(output);
    const result = parseGenAIMessages(normalized);
    assert.ok(result, "expected the wrapped GenAI message to be claimed by the GenAI parser");
    assert.strictEqual(result[0].role, "assistant");
    const content = result[0].content as any[];
    assert.strictEqual(content[0].type, "tool-call");
    assert.strictEqual(content[0].toolName, "regex");
  });
});
