import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { processMessages } from "@/lib/spans/process-messages";
import { linkToolResults, normalizeMessage, pairToolResults, preview } from "@/lib/spans/turn-parts";

const normalizeAll = (raw: unknown) => {
  const processed = processMessages(raw);
  return processed.messages.map((_, i) => normalizeMessage(processed, i));
};

describe("normalizeMessage", () => {
  it("flattens OpenAI tool calls and results", () => {
    const [call, result] = normalizeAll([
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "c1", type: "function", function: { name: "read_file", arguments: '{"path":"a.ts"}' } }],
      },
      { role: "tool", tool_call_id: "c1", content: "file body" },
    ]);

    assert.deepEqual(call?.parts, [{ kind: "tool-call", id: "c1", name: "read_file", args: { path: "a.ts" } }]);
    assert.deepEqual(result?.parts, [{ kind: "tool-result", id: "c1", output: "file body" }]);
  });

  it("flattens Anthropic tool_use / tool_result blocks", () => {
    const [call, result] = normalizeAll([
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "hmm", signature: "s" },
          { type: "tool_use", id: "t1", name: "grep", input: { q: "foo" } },
        ],
      },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "3 matches" }] },
    ]);

    assert.deepEqual(
      call?.parts.map((p) => p.kind),
      ["reasoning", "tool-call"]
    );
    assert.deepEqual(result?.parts, [{ kind: "tool-result", id: "t1", output: "3 matches" }]);
  });

  it("caches per parsed message", () => {
    const processed = processMessages([{ role: "user", content: "hi" }]);
    assert.equal(normalizeMessage(processed, 0), normalizeMessage(processed, 0));
  });

  it("returns null for parts it can't flatten so the provider renderer is used", () => {
    const [message] = normalizeAll([
      { role: "user", content: [{ type: "image_url", image_url: { url: "https://x/y.png" } }] },
    ]);
    assert.equal(message, null);
  });
});

describe("preview", () => {
  it("cuts long strings before serializing", () => {
    const text = preview({ path: "a.ts", body: "x".repeat(1_000_000) });
    assert.equal(text.length, 240);
    assert.ok(text.startsWith('{"path":"a.ts","body":"xxx'));
  });

  it("collapses whitespace in plain strings", () => {
    assert.equal(preview("line one\n\n  line two"), "line one line two");
  });
});

describe("linkToolResults", () => {
  it("tells each result which call it answers without moving it", () => {
    const [assistant, result] = linkToolResults(
      normalizeAll([
        {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "c1", type: "function", function: { name: "grep", arguments: '{"q":"foo"}' } }],
        },
        { role: "tool", tool_call_id: "c1", content: "3 matches" },
      ])
    );

    assert.equal(assistant?.parts.length, 1);
    assert.deepEqual(result?.parts[0], {
      kind: "tool-result",
      id: "c1",
      name: "grep",
      output: "3 matches",
      call: { args: { q: "foo" } },
    });
  });
});

describe("pairToolResults", () => {
  it("moves each result under its call and leaves unmatched results in place", () => {
    const messages = linkToolResults(
      normalizeAll([
        {
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "c1", type: "function", function: { name: "a", arguments: "{}" } },
            { id: "c2", type: "function", function: { name: "b", arguments: "{}" } },
          ],
        },
        { role: "tool", tool_call_id: "c2", content: "r2" },
        { role: "tool", tool_call_id: "c1", content: "r1" },
        { role: "tool", tool_call_id: "zz", content: "orphan" },
      ])
    );
    const [assistant, r2, r1, orphan] = pairToolResults(messages);

    const calls = assistant?.parts as { result?: { output: unknown; name?: string } }[];
    assert.deepEqual(
      calls.map((c) => c.result?.output),
      ["r1", "r2"]
    );
    assert.equal(calls[0].result?.name, "a");
    assert.equal(r2?.parts.length, 0);
    assert.equal(r1?.parts.length, 0);
    assert.equal(orphan?.parts.length, 1);
  });

  it("pairs Gemini calls and responses by name", () => {
    const [call, response] = pairToolResults(
      normalizeAll([
        { role: "model", parts: [{ functionCall: { name: "weather", args: { city: "SF" } } }] },
        { role: "user", parts: [{ functionResponse: { name: "weather", response: { temp: 60 } } }] },
      ])
    );

    assert.deepEqual((call!.parts[0] as { result?: { output: unknown } }).result?.output, { temp: 60 });
    assert.equal(response?.parts.length, 0);
  });
});
