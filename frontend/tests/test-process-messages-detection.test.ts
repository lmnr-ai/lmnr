import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { processMessages } from "@/lib/spans/process-messages";
import { parseAiSdkMessages } from "@/lib/spans/types/ai-sdk";
import { parseGenAIMessages } from "@/lib/spans/types/gen-ai";

// Pins the detector-chain ordering in `processMessages` (LAM-1922): verbatim
// AI SDK payloads must be claimed BEFORE the loose OpenAI schemas, while
// genuine OpenAI / Anthropic / Gemini / LangChain payloads keep their parsers.

describe("processMessages detection ordering", () => {
  it("claims a verbatim AI SDK LanguageModel prompt as generic (not OpenAI)", () => {
    const verbatim = [
      { role: "system", content: "be helpful" },
      {
        role: "user",
        content: [
          { type: "text", text: "what is this?" },
          { type: "file", data: "https://example.com/pic.png", mediaType: "image/png" },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "hmm", providerOptions: { anthropic: { signature: "s" } } },
          { type: "tool-call", toolCallId: "c1", toolName: "t", input: {} },
        ],
      },
    ];
    const result = processMessages(verbatim);
    assert.strictEqual(result.type, "generic");
    // Reasoning part survived (the OpenAI parser would have dropped it).
    const assistant = result.messages[2].content as any[];
    assert.strictEqual(assistant[0].type, "reasoning");
  });

  it("claims a verbatim AI SDK output message ([{role: assistant, content: event.content}])", () => {
    const verbatim = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "the answer", providerMetadata: { openai: { itemId: "msg_1" } } },
          { type: "tool-call", toolCallId: "c1", toolName: "t", input: { a: 1 } },
        ],
      },
    ];
    const result = processMessages(verbatim);
    assert.strictEqual(result.type, "generic");
  });

  it("keeps a plain text-only chat away from the AI SDK parser", () => {
    const plain = [
      { role: "system", content: "be helpful" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    assert.strictEqual(parseAiSdkMessages(plain), null);
    // The chain still renders it (via OpenAI or generic) — just not by claiming
    // it as an AI SDK payload.
    const result = processMessages(plain);
    assert.ok(result.messages.length === 3);
  });

  it("keeps OpenAI payloads with tool_calls on the OpenAI parser", () => {
    const openai = [
      { role: "user", content: "weather?" },
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "c1", type: "function", function: { name: "get_weather", arguments: "{}" } }],
      },
    ];
    const result = processMessages(openai);
    assert.strictEqual(result.type, "openai");
  });

  it("keeps OpenAI image payloads on the OpenAI parser", () => {
    const openai = [
      {
        role: "user",
        content: [
          { type: "text", text: "look" },
          { type: "image_url", image_url: { url: "https://example.com/pic.png" } },
        ],
      },
    ];
    const result = processMessages(openai);
    assert.strictEqual(result.type, "openai");
  });

  it("keeps Anthropic payloads on the Anthropic parser", () => {
    const anthropic = [
      { role: "user", content: "weather?" },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "hmm", signature: "sig" },
          { type: "tool_use", id: "c1", name: "get_weather", input: { city: "SF" } },
        ],
      },
    ];
    const result = processMessages(anthropic);
    assert.strictEqual(result.type, "anthropic");
  });

  it("keeps LangChain payloads on the LangChain parser", () => {
    const langchain = [
      { role: "human", content: "hi" },
      { role: "ai", content: "hello" },
    ];
    const result = processMessages(langchain);
    assert.strictEqual(result.type, "langchain");
  });

  it("keeps Gemini payloads on the Gemini parser", () => {
    const gemini = [{ role: "user", parts: [{ text: "hi" }] }];
    const result = processMessages(gemini);
    assert.strictEqual(result.type, "gemini");
  });

  it("keeps OTel GenAI semconv payloads on the GenAI parser (parts vs content)", () => {
    // `looksLikeGenAIMessages` keys off `{role, parts}`; verbatim AI SDK is
    // `{role, content}` — pin that neither claims the other's shape.
    const genai = [
      { role: "user", parts: [{ type: "text", content: "hi" }] },
      { role: "assistant", parts: [{ type: "tool_call", id: "c1", name: "t", arguments: {} }] },
    ];
    assert.ok(parseGenAIMessages(genai), "GenAI parser must claim {role, parts}");
    assert.strictEqual(parseAiSdkMessages(genai), null, "AI SDK parser must not claim {role, parts}");

    const verbatim = [
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "c1", toolName: "t", input: {} }] },
    ];
    assert.strictEqual(parseGenAIMessages(verbatim), null, "GenAI parser must not claim {role, content}");
    assert.ok(parseAiSdkMessages(verbatim), "AI SDK parser must claim dash-typed content parts");
  });

  it("claims the legacy server-reshaped snake_case shape as generic", () => {
    // Old v7 spans stored via the `ai.prompt.messages` reshape remain in
    // ClickHouse indefinitely.
    const reshaped = [
      { role: "user", content: [{ type: "text", text: "weather?" }] },
      {
        role: "assistant",
        content: [{ type: "tool_call", id: "c1", name: "get_weather", arguments: { city: "SF" } }],
      },
    ];
    const result = processMessages(reshaped);
    assert.strictEqual(result.type, "generic");
    const assistant = result.messages[1].content as any[];
    assert.strictEqual(assistant[0].type, "tool-call");
    assert.strictEqual(assistant[0].toolName, "get_weather");
  });

  it("claims the full legacy reshape incl. stringified assistant content and text-part tool messages", () => {
    // Exact shape observed on a live legacy span: the server reshape
    // JSON-stringifies assistant tool_call arrays and stores tool results as
    // `{type:"text"}` parts inside a `role:"tool"` message.
    const reshaped = [
      { role: "user", content: [{ type: "text", text: "What's the weather in SF?" }] },
      {
        role: "assistant",
        content: '[{"type":"tool_call","id":"call_legacy_1","name":"get_weather","arguments":{"city":"SF"}}]',
      },
      { role: "tool", content: [{ type: "text", text: '{"temp": 18}' }] },
    ];
    const result = processMessages(reshaped);
    assert.strictEqual(result.type, "generic");
    const assistant = result.messages[1].content as any[];
    assert.strictEqual(assistant[0].type, "tool-call");
    assert.strictEqual(assistant[0].toolName, "get_weather");
    const tool = result.messages[2].content as any[];
    assert.strictEqual(tool[0].type, "text");
  });
});
