import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseGenAIMessages } from "@/lib/spans/types/gen-ai";

describe("parseGenAIMessages", () => {
  it("returns null for payloads that aren't GenAI-shaped", () => {
    assert.strictEqual(parseGenAIMessages(null), null);
    assert.strictEqual(parseGenAIMessages([]), null);
    assert.strictEqual(parseGenAIMessages([{ role: "user", content: "hi" }]), null);
    assert.strictEqual(parseGenAIMessages("a string"), null);
  });

  it("decodes a chat input with text and tool_call parts", () => {
    const input = [
      {
        role: "user",
        parts: [{ type: "text", content: "What's the weather in SF?" }],
      },
      {
        role: "assistant",
        parts: [
          { type: "text", content: "Let me check." },
          {
            type: "tool_call",
            id: "call_abc",
            name: "get_weather",
            arguments: { location: "SF" },
          },
        ],
      },
    ];

    const result = parseGenAIMessages(input);
    assert.ok(result, "expected non-null result");
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].role, "user");
    assert.deepStrictEqual(result[0].content, [{ type: "text", text: "What's the weather in SF?" }]);

    assert.strictEqual(result[1].role, "assistant");
    const assistantContent = result[1].content as any[];
    assert.strictEqual(assistantContent.length, 2);
    assert.deepStrictEqual(assistantContent[0], { type: "text", text: "Let me check." });
    assert.strictEqual(assistantContent[1].type, "tool-call");
    assert.strictEqual(assistantContent[1].toolCallId, "call_abc");
    assert.strictEqual(assistantContent[1].toolName, "get_weather");
    assert.deepStrictEqual(assistantContent[1].input, { location: "SF" });
  });

  it("decodes tool_call_response parts with string and object results", () => {
    const input = [
      {
        role: "tool",
        parts: [
          {
            type: "tool_call_response",
            id: "call_abc",
            name: "get_weather",
            result: { temp_f: 65 },
          },
        ],
      },
    ];

    const result = parseGenAIMessages(input);
    assert.ok(result);
    const content = result[0].content as any[];
    assert.strictEqual(content[0].type, "tool-result");
    assert.strictEqual(content[0].toolCallId, "call_abc");
    assert.strictEqual(content[0].toolName, "get_weather");
    assert.strictEqual(content[0].output.type, "json");
    assert.strictEqual(content[0].output.value, JSON.stringify({ temp_f: 65 }));
  });

  it("treats bare-string parts as implicit text (for system_instructions arrays)", () => {
    const input = [
      {
        role: "system",
        parts: ["Be helpful", "Answer concisely"],
      },
    ];

    const result = parseGenAIMessages(input);
    assert.ok(result);
    assert.strictEqual(result[0].role, "system");
    assert.deepStrictEqual(result[0].content, [
      { type: "text", text: "Be helpful" },
      { type: "text", text: "Answer concisely" },
    ]);
  });

  it("skips empty text/thinking parts instead of emitting blank strings", () => {
    const input = [
      {
        role: "assistant",
        parts: [{ type: "text", content: "" }, { type: "thinking" }, { type: "text", content: "hello" }],
      },
    ];

    const result = parseGenAIMessages(input);
    assert.ok(result);
    assert.deepStrictEqual(result[0].content, [{ type: "text", text: "hello" }]);
  });

  it("decodes uri/blob parts as image or file depending on modality/mime", () => {
    const input = [
      {
        role: "user",
        parts: [
          { type: "uri", uri: "https://example.com/pic.png", modality: "image" },
          {
            type: "blob",
            content: "AAAA",
            mime_type: "image/png",
            modality: "image",
          },
          { type: "uri", uri: "https://example.com/doc.pdf", mime_type: "application/pdf" },
        ],
      },
    ];

    const result = parseGenAIMessages(input);
    assert.ok(result);
    const content = result[0].content as any[];
    assert.deepStrictEqual(content[0], { type: "image", image: "https://example.com/pic.png" });
    assert.deepStrictEqual(content[1], { type: "image", image: "data:image/png;base64,AAAA" });
    assert.strictEqual(content[2].type, "file");
    assert.strictEqual(content[2].data, "https://example.com/doc.pdf");
    assert.strictEqual(content[2].mimeType, "application/pdf");
  });
});
