import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseExtractedMessages } from "@/lib/actions/sessions/parse-input";
import { matchProviderKey } from "@/lib/actions/spans/previews/provider-keys";
import { extractToolsIfToolOnly } from "@/lib/actions/spans/previews/tool-detection";
import { detectOutputStructure } from "@/lib/actions/spans/previews/utils";
import { extractSystemMessageContent, parseSystemMessageFromInput } from "@/lib/actions/spans/system-messages";
import { detectProvider } from "@/lib/spans/providers";

describe("provider registry: detectProvider", () => {
  it("detects OpenAI chat completion output", () => {
    const data = { message: { role: "assistant", content: "hi" } };
    assert.strictEqual(detectProvider(data), "openai");
    assert.strictEqual(detectOutputStructure(data), "openai");
  });

  it("detects Anthropic-only content blocks (thinking)", () => {
    // An assistant message with a thinking block is uniquely Anthropic-shaped.
    // OpenAI's text-part schema doesn't accept `type: "thinking"`.
    const data = {
      role: "assistant",
      content: [{ type: "thinking", thinking: "reasoning...", signature: "sig" }],
    };
    assert.strictEqual(detectProvider(data), "anthropic");
  });

  it("detects Gemini candidate output", () => {
    const data = { content: { role: "model", parts: [{ text: "hi" }] } };
    assert.strictEqual(detectProvider(data), "gemini");
  });

  it("detects a bare assistant message as LangChain", () => {
    // OpenAI's `detect` only matches OUTPUT (choice-wrapped) shapes, so a
    // bare assistant message falls through to LangChain's detector, which
    // accepts any `{role: "assistant"|"ai", ...}` shape.
    const data = { role: "assistant", content: "hi" };
    assert.strictEqual(detectProvider(data), "langchain");
  });

  it("detects OpenAI choice-wrapped output (not bare message)", () => {
    const data = { message: { role: "assistant", content: "hi" } };
    assert.strictEqual(detectProvider(data), "openai");
  });

  it("detects OpenAI Responses items array", () => {
    const data = [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }];
    assert.strictEqual(detectProvider(data), "openai-responses");
  });

  it("returns unknown for arbitrary objects", () => {
    assert.strictEqual(detectProvider({ foo: "bar" }), "unknown");
  });
});

describe("provider registry: matchProviderKey rendering", () => {
  it("renders OpenAI choice-wrapped assistant text", () => {
    const data = { message: { role: "assistant", content: "hello world" } };
    const m = matchProviderKey(data);
    assert.ok(m);
    assert.strictEqual(m!.rendered, "hello world");
  });

  it("renders Anthropic content blocks (hinted)", () => {
    const data = {
      role: "assistant",
      content: [
        { type: "text", text: "one" },
        { type: "text", text: "two" },
      ],
    };
    // Hint is required because the same shape also matches OpenAI.
    const m = matchProviderKey(data, "anthropic");
    assert.ok(m);
    assert.strictEqual(m!.rendered, "one\n\ntwo");
  });

  it("renders Gemini candidate text", () => {
    const data = { content: { role: "model", parts: [{ text: "g-hello" }] } };
    const m = matchProviderKey(data);
    assert.ok(m);
    assert.strictEqual(m!.rendered, "g-hello");
  });

  it("renders OpenAI Responses assistant output_text", () => {
    const data = {
      object: "response",
      output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "r-hello" }] }],
    };
    const m = matchProviderKey(data, "openai-responses");
    assert.ok(m);
    assert.strictEqual(m!.rendered, "r-hello");
  });

  it("returns null for non-matching payloads", () => {
    assert.strictEqual(matchProviderKey({ foo: "bar" }), null);
  });
});

describe("provider registry: extractToolsIfToolOnly", () => {
  it("extracts OpenAI tool calls when no text", () => {
    const data = {
      message: {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "c1", type: "function", function: { name: "get_weather", arguments: '{"c":"SF"}' } }],
      },
    };
    const tools = extractToolsIfToolOnly(data, "openai");
    assert.ok(tools);
    assert.strictEqual(tools!.length, 1);
    assert.strictEqual(tools![0].name, "get_weather");
  });

  it("extracts Anthropic tool_use blocks when no text", () => {
    const data = {
      role: "assistant",
      content: [{ type: "tool_use", id: "tu_1", name: "search", input: { q: "x" } }],
    };
    const tools = extractToolsIfToolOnly(data, "anthropic");
    assert.ok(tools);
    assert.strictEqual(tools![0].name, "search");
  });

  it("extracts Gemini functionCall when no text", () => {
    const data = {
      content: {
        role: "model",
        parts: [{ functionCall: { name: "get_time", args: { tz: "UTC" } } }],
      },
    };
    const tools = extractToolsIfToolOnly(data, "gemini");
    assert.ok(tools);
    assert.strictEqual(tools![0].name, "get_time");
  });

  it("returns null when OpenAI assistant has text", () => {
    const data = { message: { role: "assistant", content: "hello", tool_calls: [] } };
    assert.strictEqual(extractToolsIfToolOnly(data, "openai"), null);
  });
});

describe("provider registry: parseExtractedMessages", () => {
  it("extracts system + user from OpenAI messages array", () => {
    const first = JSON.stringify({ role: "system", content: "You are helpful." });
    const last = JSON.stringify({ role: "user", content: "What is 2+2?" });
    const parsed = parseExtractedMessages(first, last);
    assert.ok(parsed);
    assert.strictEqual(parsed!.systemText, "You are helpful.");
    assert.deepStrictEqual(parsed!.userParts, [{ text: "What is 2+2?" }]);
  });

  it("extracts system + user from Anthropic messages array", () => {
    const first = JSON.stringify({
      role: "system",
      content: [{ type: "text", text: "system prompt" }],
    });
    const last = JSON.stringify({
      role: "user",
      content: [{ type: "text", text: "user question" }],
    });
    const parsed = parseExtractedMessages(first, last);
    assert.ok(parsed);
    assert.strictEqual(parsed!.systemText, "system prompt");
    assert.deepStrictEqual(parsed!.userParts, [{ text: "user question" }]);
  });

  it("extracts system + user from Gemini contents array", () => {
    const first = JSON.stringify({ role: "system", parts: [{ text: "g-sys" }] });
    const last = JSON.stringify({ role: "user", parts: [{ text: "g-user" }] });
    const parsed = parseExtractedMessages(first, last);
    assert.ok(parsed);
    assert.strictEqual(parsed!.systemText, "g-sys");
    assert.deepStrictEqual(parsed!.userParts, [{ text: "g-user" }]);
  });

  it("extracts system + user from OpenAI Responses input_text parts", () => {
    const first = JSON.stringify({
      type: "message",
      role: "system",
      content: [{ type: "input_text", text: "r-sys" }],
    });
    const last = JSON.stringify({
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "r-user" }],
    });
    const parsed = parseExtractedMessages(first, last);
    assert.ok(parsed);
    assert.strictEqual(parsed!.systemText, "r-sys");
    assert.deepStrictEqual(parsed!.userParts, [{ text: "r-user" }]);
  });

  it("returns null when no provider matches", () => {
    assert.strictEqual(parseExtractedMessages('{"foo":"bar"}', '{"baz":1}'), null);
  });
});

describe("system-messages: extractSystemMessageContent (single message)", () => {
  it("returns null for non-system messages", () => {
    assert.strictEqual(extractSystemMessageContent({ role: "user", content: "hi" }), null);
  });

  it("extracts string content (OpenAI / LangChain)", () => {
    assert.strictEqual(extractSystemMessageContent({ role: "system", content: "be nice" }), "be nice");
  });

  it("extracts OpenAI chat text-part content", () => {
    const msg = { role: "system", content: [{ type: "text", text: "chat sys" }] };
    assert.strictEqual(extractSystemMessageContent(msg), "chat sys");
  });

  it("extracts OpenAI Responses input_text content", () => {
    // Previously returned null because the function only looked for `type: "text"`.
    const msg = { role: "system", content: [{ type: "input_text", text: "responses sys" }] };
    assert.strictEqual(extractSystemMessageContent(msg), "responses sys");
  });

  it("extracts OpenAI Responses message wrapper with input_text", () => {
    const msg = {
      type: "message",
      role: "system",
      content: [{ type: "input_text", text: "wrapped sys" }],
    };
    assert.strictEqual(extractSystemMessageContent(msg), "wrapped sys");
  });

  it("extracts Gemini parts content", () => {
    const msg = { role: "system", parts: [{ text: "gemini sys" }] };
    assert.strictEqual(extractSystemMessageContent(msg), "gemini sys");
  });

  it("returns null for garbage input", () => {
    assert.strictEqual(extractSystemMessageContent(null), null);
    assert.strictEqual(extractSystemMessageContent("string"), null);
    assert.strictEqual(extractSystemMessageContent({}), null);
  });
});

describe("system-messages: parseSystemMessageFromInput (raw JSON)", () => {
  it("extracts from OpenAI Chat Completions array", () => {
    const input = JSON.stringify([
      { role: "system", content: "sys" },
      { role: "user", content: "u" },
    ]);
    assert.strictEqual(parseSystemMessageFromInput(input), "sys");
  });

  it("extracts from OpenAI Responses items array", () => {
    const input = JSON.stringify([
      { type: "message", role: "system", content: [{ type: "input_text", text: "r-sys" }] },
      { type: "message", role: "user", content: [{ type: "input_text", text: "u" }] },
    ]);
    assert.strictEqual(parseSystemMessageFromInput(input), "r-sys");
  });

  it("extracts from Gemini contents array", () => {
    const input = JSON.stringify([
      { role: "system", parts: [{ text: "g-sys" }] },
      { role: "user", parts: [{ text: "u" }] },
    ]);
    assert.strictEqual(parseSystemMessageFromInput(input), "g-sys");
  });

  it("extracts from LangChain array with `human` role", () => {
    // This shape fails OpenAI's strict parser (role:"human" rejected) and
    // must fall through to the LangChain adapter.
    const input = JSON.stringify([
      { role: "system", content: "lc-sys" },
      { role: "human", content: "u" },
    ]);
    assert.strictEqual(parseSystemMessageFromInput(input), "lc-sys");
  });

  it("returns null when JSON is invalid", () => {
    assert.strictEqual(parseSystemMessageFromInput("not json"), null);
  });

  it("returns null when no system message is present", () => {
    const input = JSON.stringify([{ role: "user", content: "hi" }]);
    assert.strictEqual(parseSystemMessageFromInput(input), null);
  });
});
