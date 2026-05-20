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

  it("wraps a bare JSON object output as a json envelope (not double-stringified)", () => {
    // Backend may serialise `output` as a bare JSON object when the AI SDK
    // emitted a non-tagged value. Wrap it as `{type: "json", value: <obj>}` so
    // the renderer's pretty-print path receives the original object rather than
    // a stringified copy of an envelope.
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
      type: "json",
      value: { temp: 65, conditions: "sunny" },
    });
  });

  it("passes an AI SDK v7 LanguageModelV2ToolResultOutput envelope through verbatim", () => {
    // The backend's ChatMessageAISDKToolResult.output is `serde_json::Value`, so
    // when the AI SDK emits the tagged envelope (`{type: "text", value: "65F"}`)
    // it arrives unchanged. The previous code unconditionally JSON.stringify'd
    // the envelope and re-wrapped it, surfacing `{"type":"text","value":"65F"}`
    // as the rendered output. Pass through verbatim so the renderer unwraps
    // exactly one level.
    const textEnvelope = [
      {
        role: "tool",
        content: [
          { type: "text", text: "" },
          {
            type: "tool-result",
            toolCallId: "call_text",
            toolName: "get_weather",
            output: { type: "text", value: "65F" },
          },
        ],
      },
    ] as any;

    const textResult = convertToMessages(textEnvelope);
    const textParts = textResult[0].content as any[];
    const textToolResult = textParts.find((p) => p.type === "tool-result");
    assert.ok(textToolResult);
    assert.deepStrictEqual(textToolResult.output, { type: "text", value: "65F" });

    // Same for the json envelope variant.
    const jsonEnvelope = [
      {
        role: "tool",
        content: [
          { type: "text", text: "" },
          {
            type: "tool-result",
            toolCallId: "call_json",
            toolName: "get_weather",
            output: { type: "json", value: { temp: 65 } },
          },
        ],
      },
    ] as any;

    const jsonResult = convertToMessages(jsonEnvelope);
    const jsonParts = jsonResult[0].content as any[];
    const jsonToolResult = jsonParts.find((p) => p.type === "tool-result");
    assert.ok(jsonToolResult);
    assert.deepStrictEqual(jsonToolResult.output, { type: "json", value: { temp: 65 } });
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

  it("falls back to a json-null envelope when part.output is undefined", () => {
    // `output` of `undefined` (missing key) is coerced to a `{type: "json", value: null}`
    // envelope so the renderer always receives a defined, serialisable value.
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
    assert.deepStrictEqual(toolResult.output, { type: "json", value: null });
  });
});
