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

  it("rejects messages whose role is not a canonical ModelMessage role", () => {
    // The role-discriminated union only knows system/user/assistant/tool. A
    // `human`/`ai`-style role (LangChain) must fall through even when it carries
    // an otherwise-AI-SDK-looking part.
    const input = [{ role: "human", content: [{ type: "tool-call", toolCallId: "c1", toolName: "t", input: {} }] }];
    assert.strictEqual(parseAiSdkMessages(input), null);
  });

  it("rejects a tool message carrying a non-tool part (strict tool content)", () => {
    // `tool` content is strict — only tool-result / tool-approval-response. A
    // tool-call under a tool role is malformed AI-SDK and must fall through
    // rather than be claimed via the escape hatch.
    const input = [{ role: "tool", content: [{ type: "tool-call", toolCallId: "c1", toolName: "t", input: {} }] }];
    assert.strictEqual(parseAiSdkMessages(input), null);
  });

  it("rejects a system message with array content (system content must be a string)", () => {
    const input = [{ role: "system", content: [{ type: "text", text: "you are helpful" }] }];
    assert.strictEqual(parseAiSdkMessages(input), null);
  });

  it("double-parses a JSON-stringified assistant content array (SDK double-encoding)", () => {
    // The lmnr SDK stringifies assistant `content`, so the parts array arrives
    // as a string; it must be decoded back to an array before rendering.
    const input = [
      {
        role: "assistant",
        content: JSON.stringify([
          { type: "reasoning", text: "thinking" },
          { type: "text", text: "here you go" },
          { type: "tool-call", toolCallId: "c1", toolName: "get_weather", input: { city: "SF" } },
        ]),
      },
    ];

    const result = parseAiSdkMessages(input);
    assert.ok(result, "expected the decoded parts array to be claimed");
    const content = result[0].content as any[];
    assert.ok(Array.isArray(content));
    assert.strictEqual(content[0].type, "reasoning");
    assert.strictEqual(content[1].type, "text");
    assert.deepStrictEqual(content[2], {
      type: "tool-call",
      toolCallId: "c1",
      toolName: "get_weather",
      input: { city: "SF" },
    });
  });

  it("does not mangle assistant text content that merely starts with '['", () => {
    // A plain-text assistant message whose text starts with `[` must NOT be
    // coerced into a parts array — it isn't valid JSON, so it stays a string.
    const input = [
      { role: "assistant", content: "[draft] here is my answer" },
      {
        role: "tool",
        content: [{ type: "tool-result", toolCallId: "c1", toolName: "t", output: { type: "text", value: "ok" } }],
      },
    ];

    const result = parseAiSdkMessages(input);
    assert.ok(result, "expected the tool-result to claim this payload");
    assert.strictEqual(result[0].content, "[draft] here is my answer");
  });

  it("converts server-reshaped tool_call parts mixed with preserved raw parts", () => {
    // App-server stores instrumentation tool calls as snake-case
    // {type: "tool_call", name, id, arguments} while preserving unknown parts
    // (reasoning) verbatim — a stored assistant turn mixes both shapes.
    const input = [
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "I should call the tool.", providerOptions: { anthropic: { signature: "s" } } },
          { type: "text", text: "Calling." },
          { type: "tool_call", name: "get_weather", id: "call_1", arguments: { city: "SF" } },
        ],
      },
    ];

    const result = parseAiSdkMessages(input);
    assert.ok(result, "expected the reasoning part to claim this payload");
    const content = result[0].content as any[];
    assert.strictEqual(content[0].type, "reasoning");
    assert.deepStrictEqual(content[2], {
      type: "tool-call",
      toolCallId: "call_1",
      toolName: "get_weather",
      input: { city: "SF" },
    });
  });

  it("converts server-reshaped tool_call with a null id to an empty toolCallId", () => {
    const input = [
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "hmm" },
          { type: "tool_call", name: "t", id: null, arguments: {} },
        ],
      },
    ];

    const result = parseAiSdkMessages(input);
    assert.ok(result);
    const content = result[0].content as any[];
    assert.deepStrictEqual(content[1], { type: "tool-call", toolCallId: "", toolName: "t", input: {} });
  });

  it("claims via a distinctive part and preserves an unmodeled future part verbatim", () => {
    // The single escape hatch: a well-formed part with a string `type` we don't
    // model yet rides through untouched (the generic renderer JSON-dumps it),
    // provided the message is claimed via a genuinely distinctive part.
    const input = [
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "thinking" },
          { type: "tool-poll", pollId: "p1", detail: { nested: true } },
        ],
      },
    ];

    const result = parseAiSdkMessages(input);
    assert.ok(result, "expected the distinctive reasoning part to claim this payload");
    const content = result[0].content as any[];
    assert.strictEqual(content[0].type, "reasoning");
    assert.deepStrictEqual(content[1], { type: "tool-poll", pollId: "p1", detail: { nested: true } });
  });
});
