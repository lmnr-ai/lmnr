import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAiSdkMessages } from "@/lib/spans/types/ai-sdk";

describe("parseAiSdkMessages", () => {
  it("returns null for payloads that aren't native AI-SDK-shaped", () => {
    assert.strictEqual(parseAiSdkMessages(null), null);
    assert.strictEqual(parseAiSdkMessages([]), null);
    assert.strictEqual(parseAiSdkMessages("a string"), null);
    // Plain text-only conversations have no distinctive part discriminator and
    // must fall through to other detectors / the generic path.
    assert.strictEqual(parseAiSdkMessages([{ role: "user", content: "hi" }]), null);
    assert.strictEqual(parseAiSdkMessages([{ role: "user", content: [{ type: "text", text: "hi" }] }]), null);
  });

  it("preserves reasoning and dash-style tool-call parts the generic converter would stringify", () => {
    const input = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: [{ type: "text", text: "What's the weather?" }] },
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "The user wants weather." },
          { type: "text", text: "Let me check." },
          { type: "tool-call", toolCallId: "call_1", toolName: "get_weather", input: { city: "SF" } },
        ],
      },
    ];

    const result = parseAiSdkMessages(input);
    assert.ok(result, "expected AI SDK parser to claim this payload");
    assert.strictEqual(result.length, 3);

    // String content passes through unchanged.
    assert.strictEqual(result[0].role, "system");
    assert.strictEqual(result[0].content, "You are helpful.");

    const assistant = result[2].content as any[];
    assert.deepStrictEqual(assistant[0], { type: "reasoning", text: "The user wants weather." });
    assert.deepStrictEqual(assistant[1], { type: "text", text: "Let me check." });
    assert.deepStrictEqual(assistant[2], {
      type: "tool-call",
      toolCallId: "call_1",
      toolName: "get_weather",
      input: { city: "SF" },
    });
  });

  it("preserves tool-result parts with the v7 output union intact", () => {
    const input = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_1",
            toolName: "get_weather",
            output: { type: "json", value: JSON.stringify({ temp: 65 }) },
          },
        ],
      },
    ];

    const result = parseAiSdkMessages(input);
    assert.ok(result);
    const content = result[0].content as any[];
    assert.strictEqual(content[0].type, "tool-result");
    assert.strictEqual(content[0].toolCallId, "call_1");
    assert.strictEqual(content[0].toolName, "get_weather");
    assert.deepStrictEqual(content[0].output, { type: "json", value: JSON.stringify({ temp: 65 }) });
  });

  it("preserves provider metadata on tool-call/tool-result/reasoning parts", () => {
    // Real v7 parts carry extra keys (providerOptions, providerExecuted) that
    // the generic renderer surfaces via omit(part, "type") — they must not be
    // stripped by Zod's default key-stripping nor by the field-by-field rebuild.
    const input = [
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "hmm", providerOptions: { anthropic: { signature: "sig" } } },
          {
            type: "tool-call",
            toolCallId: "c1",
            toolName: "t",
            input: {},
            providerExecuted: true,
            providerOptions: { openai: { foo: 1 } },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "c1",
            toolName: "t",
            output: { type: "json", value: "{}" },
            providerOptions: { openai: { bar: 2 } },
          },
        ],
      },
    ];

    const result = parseAiSdkMessages(input);
    assert.ok(result);
    const assistant = result[0].content as any[];
    assert.deepStrictEqual(assistant[0].providerOptions, { anthropic: { signature: "sig" } });
    assert.strictEqual(assistant[1].providerExecuted, true);
    assert.deepStrictEqual(assistant[1].providerOptions, { openai: { foo: 1 } });
    const tool = result[1].content as any[];
    assert.deepStrictEqual(tool[0].providerOptions, { openai: { bar: 2 } });
  });

  it("skips empty text/reasoning parts", () => {
    const input = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "" },
          { type: "reasoning", text: "" },
          { type: "tool-call", toolCallId: "c1", toolName: "t", input: {} },
        ],
      },
    ];

    const result = parseAiSdkMessages(input);
    assert.ok(result);
    const content = result[0].content as any[];
    assert.strictEqual(content.length, 1);
    assert.strictEqual(content[0].type, "tool-call");
  });

  it("normalizes image URL parts and passes bare-string image data through", () => {
    const input = [
      {
        role: "user",
        content: [
          { type: "text", text: "look" },
          { type: "image", image: "https://example.com/pic.png" },
          { type: "tool-call", toolCallId: "c1", toolName: "t", input: {} },
        ],
      },
    ];

    const result = parseAiSdkMessages(input);
    assert.ok(result);
    const content = result[0].content as any[];
    assert.deepStrictEqual(content[1], { type: "image", image: "https://example.com/pic.png" });
  });

  it("passes exotic v7 parts through verbatim for the renderer's JSON fallback", () => {
    // custom / reasoning-file / tool-approval-* have no dedicated UI; they must
    // survive parsing so the generic renderer can surface them as JSON.
    const input = [
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "hmm" },
          { type: "custom", kind: "acme.widget", providerOptions: { acme: { foo: 1 } } },
          { type: "reasoning-file", data: "https://example.com/r.txt", mediaType: "text/plain" },
          { type: "tool-approval-request", approvalId: "a1", toolCallId: "c1" },
        ],
      },
    ];

    const result = parseAiSdkMessages(input);
    assert.ok(result);
    const content = result[0].content as any[];
    assert.strictEqual(content[0].type, "reasoning");
    assert.strictEqual(content[1].type, "custom");
    assert.strictEqual(content[1].kind, "acme.widget");
    assert.strictEqual(content[2].type, "reasoning-file");
    assert.strictEqual(content[3].type, "tool-approval-request");
    assert.strictEqual(content[3].approvalId, "a1");
  });

  it("does not claim OpenAI-style payloads (underscore tool_call, function tool_calls)", () => {
    // OpenAI assistant messages use a top-level `tool_calls` array, not nested
    // dash-style parts — this must fall through to the OpenAI detector.
    const openaiStyle = [
      {
        role: "assistant",
        content: "hi",
        tool_calls: [{ id: "c1", type: "function", function: { name: "t", arguments: "{}" } }],
      },
    ];
    assert.strictEqual(parseAiSdkMessages(openaiStyle), null);
  });
});
