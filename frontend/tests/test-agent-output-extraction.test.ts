import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractAgentOutput } from "@/lib/traces/agent-output";

// Pins the "valuable bits" contract for trace_outputs_v0 consumers: non-empty
// thinking/reasoning, non-empty text, tool calls (name + payload), and a
// prefer-more-over-nothing stance on unknown shapes.

describe("extractAgentOutput", () => {
  it("extracts plain string content", () => {
    assert.equal(extractAgentOutput([JSON.stringify({ role: "assistant", content: "Hello!" })]), "Hello!");
  });

  it("extracts text parts from a content array", () => {
    const msg = {
      role: "assistant",
      content: [
        { type: "text", text: "First." },
        { type: "text", text: "Second." },
      ],
    };
    assert.equal(extractAgentOutput([JSON.stringify(msg)]), "First.\n\nSecond.");
  });

  it("extracts thinking and reasoning alongside text", () => {
    const msg = {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Let me think..." },
        { type: "reasoning", reasoning: "Because X." },
        { type: "text", text: "Answer." },
      ],
    };
    assert.equal(extractAgentOutput([JSON.stringify(msg)]), "Let me think...\n\nBecause X.\n\nAnswer.");
  });

  it("skips empty thinking / text parts", () => {
    const msg = {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "   " },
        { type: "text", text: "" },
        { type: "text", text: "Real." },
      ],
    };
    assert.equal(extractAgentOutput([JSON.stringify(msg)]), "Real.");
  });

  it("extracts GenAI parts ({role, parts} with content key)", () => {
    const msg = {
      role: "assistant",
      parts: [{ type: "text", content: "GenAI text" }],
    };
    assert.equal(extractAgentOutput([JSON.stringify(msg)]), "GenAI text");
  });

  it("renders Anthropic tool_use parts as Tool: <name> without arguments", () => {
    const msg = {
      role: "assistant",
      content: [{ type: "tool_use", name: "get_weather", input: { city: "Paris" } }],
    };
    assert.equal(extractAgentOutput([JSON.stringify(msg)]), "Tool: get_weather");
  });

  it("renders OpenAI message-level tool_calls as Tool: <name>", () => {
    const msg = {
      role: "assistant",
      content: null,
      tool_calls: [{ id: "1", type: "function", function: { name: "search", arguments: '{"q":"laminar"}' } }],
    };
    assert.equal(extractAgentOutput([JSON.stringify(msg)]), "Tool: search");
  });

  it("renders AI SDK dash-typed tool-call parts as Tool: <name>", () => {
    const msg = {
      role: "assistant",
      content: [{ type: "tool-call", toolName: "bash", args: { cmd: "ls" } }],
    };
    assert.equal(extractAgentOutput([JSON.stringify(msg)]), "Tool: bash");
  });

  it("keeps an unnamed tool call whole rather than dropping it", () => {
    const msg = {
      role: "assistant",
      content: [{ type: "tool_call", arguments: { a: 1 } }],
    };
    const out = extractAgentOutput([JSON.stringify(msg)]);
    assert.ok(out?.includes('"a":1'));
  });

  it("stringifies completely unknown parts instead of extracting nothing", () => {
    const msg = {
      role: "assistant",
      content: [{ type: "mystery_block", payload: { deep: "value" } }],
    };
    const out = extractAgentOutput([JSON.stringify(msg)]);
    assert.ok(out?.includes("mystery_block"));
    assert.ok(out?.includes("value"));
  });

  it("skips recognized non-content parts (images, tool results)", () => {
    const msg = {
      role: "assistant",
      content: [
        { type: "image", source: { data: "base64..." } },
        { type: "text", text: "Caption." },
      ],
    };
    assert.equal(extractAgentOutput([JSON.stringify(msg)]), "Caption.");
  });

  it("joins multiple messages", () => {
    const m1 = { role: "assistant", content: "A" };
    const m2 = { role: "assistant", content: [{ type: "text", text: "B" }] };
    assert.equal(extractAgentOutput([JSON.stringify(m1), JSON.stringify(m2)]), "A\n\nB");
  });

  it("treats non-JSON elements as plain text", () => {
    assert.equal(extractAgentOutput(["just text"]), "just text");
  });

  it("skips empty elements (dict misses) and returns null when truly empty", () => {
    assert.equal(extractAgentOutput(["", "  "]), null);
    assert.equal(extractAgentOutput([]), null);
  });

  it("dumps the raw message when nothing valuable was extracted", () => {
    const raw = JSON.stringify({ role: "assistant", content: [{ type: "image", source: { data: "b64" } }] });
    assert.equal(extractAgentOutput([raw]), raw);
  });

  it("handles OpenAI Responses-style nested message items", () => {
    const item = {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "Responses answer" }],
    };
    assert.equal(extractAgentOutput([JSON.stringify(item)]), "Responses answer");
  });

  it("handles OpenAI Responses reasoning items with summary", () => {
    const item = {
      type: "reasoning",
      summary: [{ type: "summary_text", text: "Thought summary" }],
    };
    assert.equal(extractAgentOutput([JSON.stringify(item)]), "Thought summary");
  });
});
