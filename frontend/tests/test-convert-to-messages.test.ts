import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { convertToMessages } from "@/lib/spans/types";

// `convertToMessages` short-circuits role: "tool" messages whose content is
// entirely `tool-result` parts (returned verbatim — see processMessageContent).
// The new `case "tool-result"` in processContentPart is exercised whenever that
// short-circuit doesn't apply: mixed-part tool messages, or tool-result parts
// embedded in a non-tool role. AI SDK v7 emits both shapes via `ai.prompt.messages`,
// and previously the default branch JSON-stringified the entire envelope into
// `output.value`, surfacing the redundant `toolCallId/toolName/output` metadata.
describe("convertToMessages — AI SDK v7 tool-result parts", () => {
  it("renders a string tool-result output verbatim, not as a quoted JSON envelope", () => {
    // Mirror what backend serialises from ChatMessageAISDKToolResult.output when
    // `output` is a bare string. Mixed with a text part so the all-tool-result
    // short-circuit doesn't fire.
    const messages = [
      {
        role: "tool",
        content: [
          { type: "text", text: "trailing note" },
          {
            type: "tool-result",
            toolCallId: "call_1",
            toolName: "get_weather",
            output: "65F and sunny",
          },
        ],
      },
    ] as any;

    const result = convertToMessages(messages);
    const parts = result[0].content as any[];
    assert.strictEqual(parts.length, 2);

    const toolResult = parts.find((p) => p.type === "tool-result");
    assert.ok(toolResult, "expected a tool-result part in output");
    assert.strictEqual(toolResult.toolCallId, "call_1");
    assert.strictEqual(toolResult.toolName, "get_weather");
    assert.deepStrictEqual(toolResult.output, { type: "text", value: "65F and sunny" });
  });

  it("JSON-stringifies a structured-object tool-result output", () => {
    // Mirror what backend serialises when `output` is a JSON object. Output value
    // must be a JSON string of the object (not the original object), since the
    // generic renderer reads `output.value` as a printable string.
    const messages = [
      {
        role: "tool",
        content: [
          { type: "text", text: "" },
          {
            type: "tool-result",
            toolCallId: "call_2",
            toolName: "get_weather",
            output: { temp: 65, conditions: "sunny" },
          },
        ],
      },
    ] as any;

    const result = convertToMessages(messages);
    const parts = result[0].content as any[];
    const toolResult = parts.find((p) => p.type === "tool-result");
    assert.ok(toolResult);
    assert.strictEqual(toolResult.toolCallId, "call_2");
    assert.strictEqual(toolResult.toolName, "get_weather");
    assert.deepStrictEqual(toolResult.output, {
      type: "text",
      value: JSON.stringify({ temp: 65, conditions: "sunny" }),
    });
  });

  it("resolves toolName from the prior tool_call store when the part omits it", () => {
    // Backend emits tool_call parts with `id`/`name`; the store populated by
    // those parts should fill in toolName for a later tool-result with only
    // `toolCallId`.
    const messages = [
      {
        role: "assistant",
        content: [
          {
            type: "tool_call",
            id: "call_3",
            name: "lookup_user",
            arguments: { id: 42 },
          },
          {
            type: "tool-result",
            toolCallId: "call_3",
            output: "found",
          },
        ],
      },
    ] as any;

    const result = convertToMessages(messages);
    const parts = result[0].content as any[];
    const toolResult = parts.find((p) => p.type === "tool-result");
    assert.ok(toolResult);
    assert.strictEqual(toolResult.toolCallId, "call_3");
    assert.strictEqual(toolResult.toolName, "lookup_user");
    assert.deepStrictEqual(toolResult.output, { type: "text", value: "found" });
  });

  it("falls back to '-' for missing toolCallId / toolName", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "preamble" },
          {
            type: "tool-result",
            output: "raw",
          },
        ],
      },
    ] as any;

    const result = convertToMessages(messages);
    const parts = result[0].content as any[];
    const toolResult = parts.find((p) => p.type === "tool-result");
    assert.ok(toolResult);
    assert.strictEqual(toolResult.toolCallId, "-");
    assert.strictEqual(toolResult.toolName, "-");
    assert.deepStrictEqual(toolResult.output, { type: "text", value: "raw" });
  });

  it("emits a string output.value when part.output is undefined", () => {
    // `JSON.stringify(undefined)` returns `undefined` (not the string "undefined"),
    // which would set `output.value` to `undefined` and propagate downstream.
    // Guard with `?? null` so the value is always a serialisable string.
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "preamble" },
          {
            type: "tool-result",
            toolCallId: "call_4",
            toolName: "noop",
          },
        ],
      },
    ] as any;

    const result = convertToMessages(messages);
    const parts = result[0].content as any[];
    const toolResult = parts.find((p) => p.type === "tool-result");
    assert.ok(toolResult);
    assert.strictEqual(typeof toolResult.output.value, "string");
    assert.strictEqual(toolResult.output.value, "null");
  });
});
