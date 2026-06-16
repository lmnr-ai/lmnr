import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type Message } from "@/lib/playground/types";
import { parseSystemMessages, transformFromLegacy } from "@/lib/playground/utils";

// ─── parseSystemMessages ───────────────────────────────────────────────────

describe("parseSystemMessages", () => {
  it("converts a system message with text content to a string-content SystemModelMessage", () => {
    const messages: Message[] = [{ role: "system", content: [{ type: "text", text: "You are helpful." }] }];
    const result = parseSystemMessages(messages);
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result[0], { role: "system", content: "You are helpful." });
  });

  it("passes through a system message whose content is not text (no conversion)", () => {
    const messages: Message[] = [{ role: "system", content: [] as any }];
    const result = parseSystemMessages(messages);
    assert.deepStrictEqual(result[0], messages[0]);
  });

  it("wraps undefined content as empty-string text part", () => {
    const messages = [{ role: "user" as const, content: undefined as any }];
    const result = transformFromLegacy(messages);
    assert.deepStrictEqual(result[0].content, [{ type: "text", text: "" }]);
  });

  it("converts a user message that is all tool-results to role=tool", () => {
    const toolResultPart = {
      type: "tool-result" as const,
      toolCallId: "call_1",
      toolName: "search",
      output: { type: "text" as const, value: "Paris" },
    };
    const messages: Message[] = [{ role: "user", content: [toolResultPart] }];
    const result = parseSystemMessages(messages);
    assert.strictEqual(result.length, 1);
    assert.strictEqual((result[0] as any).role, "tool");
    assert.deepStrictEqual((result[0] as any).content, [toolResultPart]);
  });

  it("does NOT convert a user message that mixes tool-results with other parts", () => {
    const messages: Message[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "Here is the result:" },
          {
            type: "tool-result" as const,
            toolCallId: "c1",
            toolName: "f",
            output: { type: "text" as const, value: "x" },
          },
        ],
      },
    ];
    const result = parseSystemMessages(messages);
    assert.strictEqual((result[0] as any).role, "user");
  });

  it("passes assistant messages through unchanged", () => {
    const messages: Message[] = [{ role: "assistant", content: [{ type: "text", text: "Hello!" }] }];
    const result = parseSystemMessages(messages);
    assert.deepStrictEqual(result[0], messages[0]);
  });
});

// ─── transformFromLegacy ───────────────────────────────────────────────────

describe("transformFromLegacy", () => {
  it("wraps a string content into a text part array", () => {
    const messages = [{ role: "user" as const, content: "hello" as any }];
    const result = transformFromLegacy(messages);
    assert.deepStrictEqual(result[0].content, [{ type: "text", text: "hello" }]);
  });

  it("wraps null/undefined content as empty-string text part", () => {
    const messages = [{ role: "user" as const, content: null as any }];
    const result = transformFromLegacy(messages);
    assert.deepStrictEqual(result[0].content, [{ type: "text", text: "" }]);
  });

  it("leaves array content unchanged (no legacy parts)", () => {
    const content = [{ type: "text" as const, text: "hi" }];
    const messages: Message[] = [{ role: "user", content }];
    const result = transformFromLegacy(messages);
    assert.deepStrictEqual(result[0].content, content);
  });

  it("converts V4 tool-call (args) to V5 (input)", () => {
    const messages = [
      {
        role: "assistant" as const,
        content: [
          {
            type: "tool-call",
            toolCallId: "c1",
            toolName: "search",
            args: { query: "Paris" },
          },
        ] as any,
      },
    ];
    const result = transformFromLegacy(messages);
    const part = result[0].content[0] as any;
    assert.ok(!("args" in part), "args should be removed");
    assert.deepStrictEqual(part.input, { query: "Paris" });
    assert.strictEqual(part.toolCallId, "c1");
  });

  it("converts V4 tool-call with stringified JSON args", () => {
    const messages = [
      {
        role: "assistant" as const,
        content: [
          {
            type: "tool-call",
            toolCallId: "c2",
            toolName: "calc",
            args: '{"x":1}',
          },
        ] as any,
      },
    ];
    const result = transformFromLegacy(messages);
    const part = result[0].content[0] as any;
    assert.deepStrictEqual(part.input, { x: 1 });
  });

  it("converts V4 tool-call with empty-string args to empty object", () => {
    const messages = [
      {
        role: "assistant" as const,
        content: [{ type: "tool-call", toolCallId: "c3", toolName: "noop", args: "" }] as any,
      },
    ];
    const result = transformFromLegacy(messages);
    const part = result[0].content[0] as any;
    assert.deepStrictEqual(part.input, {});
  });

  it("leaves V5 tool-call (already has input) unchanged", () => {
    const v5Part = {
      type: "tool-call",
      toolCallId: "c4",
      toolName: "search",
      input: { query: "Rome" },
    };
    const messages = [{ role: "assistant" as const, content: [v5Part] as any }];
    const result = transformFromLegacy(messages);
    assert.deepStrictEqual(result[0].content[0], v5Part);
  });

  it("converts V4 tool-result (result) to V5 (output)", () => {
    const messages = [
      {
        role: "user" as const,
        content: [
          {
            type: "tool-result",
            toolCallId: "c5",
            toolName: "search",
            result: "The Eiffel Tower",
          },
        ] as any,
      },
    ];
    const result = transformFromLegacy(messages);
    const part = result[0].content[0] as any;
    assert.ok(!("result" in part), "result should be removed");
    assert.deepStrictEqual(part.output, { type: "text", value: "The Eiffel Tower" });
  });

  it("leaves V5 tool-result (already has output) unchanged", () => {
    const v5Part = {
      type: "tool-result",
      toolCallId: "c6",
      toolName: "search",
      output: { type: "text", value: "Berlin" },
    };
    const messages = [{ role: "user" as const, content: [v5Part] as any }];
    const result = transformFromLegacy(messages);
    assert.deepStrictEqual(result[0].content[0], v5Part);
  });

  it("preserves non-tool parts (text, image) untouched", () => {
    const imagePart = { type: "image", image: "data:image/png;base64,abc" };
    const textPart = { type: "text", text: "look at this" };
    const messages = [{ role: "user" as const, content: [textPart, imagePart] as any }];
    const result = transformFromLegacy(messages);
    assert.deepStrictEqual(result[0].content, [textPart, imagePart]);
  });

  it("handles a mix of V4 tool-call and V4 tool-result in the same message", () => {
    const messages = [
      {
        role: "assistant" as const,
        content: [
          { type: "tool-call", toolCallId: "c7", toolName: "f", args: { n: 42 } },
          { type: "tool-result", toolCallId: "c7", toolName: "f", result: "done" },
        ] as any,
      },
    ];
    const result = transformFromLegacy(messages);
    const [call, res] = result[0].content as any[];
    assert.deepStrictEqual(call.input, { n: 42 });
    assert.ok(!("args" in call));
    assert.deepStrictEqual(res.output, { type: "text", value: "done" });
    assert.ok(!("result" in res));
  });
});
