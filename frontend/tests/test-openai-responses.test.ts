import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseOpenAIResponsesInput, parseOpenAIResponsesOutput } from "@/lib/spans/types/openai-responses";

describe("openai-responses parser", () => {
  it("parses Responses-style input (input_text)", () => {
    const input = [
      {
        role: "user",
        content: [
          { type: "input_text", text: "hello" },
          { type: "input_image", image_url: "https://example.com/a.png" },
        ],
      },
    ];
    const parsed = parseOpenAIResponsesInput(input);
    assert.ok(parsed);
    assert.strictEqual(parsed!.length, 1);
  });

  it("parses Responses output containing reasoning and function_call", () => {
    const output = {
      object: "response",
      id: "resp_123",
      output: [
        {
          type: "reasoning",
          id: "rs_1",
          summary: [{ type: "summary_text", text: "thinking about it" }],
        },
        {
          type: "function_call",
          id: "fc_1",
          call_id: "call_abc",
          name: "get_weather",
          arguments: '{"city":"SF"}',
        },
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "done" }],
        },
      ],
    };
    const parsed = parseOpenAIResponsesOutput(output);
    assert.ok(parsed);
    assert.strictEqual(parsed!.length, 3);
    assert.strictEqual((parsed![0] as any).type, "reasoning");
    assert.strictEqual((parsed![1] as any).name, "get_weather");
  });

  it("recognizes function_call_output items", () => {
    const input = [
      { type: "function_call", call_id: "c1", name: "x", arguments: "{}" },
      { type: "function_call_output", call_id: "c1", output: "42" },
    ];
    const parsed = parseOpenAIResponsesInput(input);
    assert.ok(parsed);
    assert.strictEqual(parsed!.length, 2);
  });

  it("handles web_search_call and image_generation_call items", () => {
    const input = [
      {
        type: "web_search_call",
        id: "ws_1",
        status: "completed",
        action: { type: "search", query: "x" },
      },
      { type: "image_generation_call", id: "ig_1", status: "completed", result: "data:image/png;base64,AAA" },
    ];
    const parsed = parseOpenAIResponsesInput(input);
    assert.ok(parsed);
    assert.strictEqual(parsed!.length, 2);
  });

  it("parses a bare string input as a single user message", () => {
    const parsed = parseOpenAIResponsesInput("hello");
    assert.ok(parsed);
    assert.strictEqual(parsed!.length, 1);
    assert.strictEqual((parsed![0] as any).role, "user");
  });

  it("does not parse Chat Completions assistant+tool_calls as Responses items", () => {
    const chatMessages = [
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "abc", type: "function", function: { name: "foo", arguments: "{}" } }],
      },
    ];
    assert.strictEqual(parseOpenAIResponsesInput(chatMessages), null);
  });

  it("parses MCP call items", () => {
    const input = [
      {
        type: "mcp_call",
        id: "mcp_1",
        server_label: "gitmcp",
        name: "search_repo",
        arguments: '{"q":"hello"}',
        output: "result",
      },
    ];
    const parsed = parseOpenAIResponsesInput(input);
    assert.ok(parsed);
    assert.strictEqual(parsed!.length, 1);
  });
});
