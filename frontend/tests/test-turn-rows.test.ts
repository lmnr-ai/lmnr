import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildConversationRows, buildFocusedRows } from "@/components/traces/span-view/span-turn/build-rows";
import { buildSpanTurn } from "@/lib/spans/turn";

const input = [
  { role: "system", content: "sys" },
  { role: "user", content: "task" },
  {
    role: "assistant",
    content: null,
    tool_calls: [{ id: "c1", type: "function", function: { name: "grep", arguments: "{}" } }],
  },
  { role: "tool", tool_call_id: "c1", content: "3 matches" },
];
const output = [{ role: "assistant", content: "done" }];

const MESSAGES = { batchResults: false, newInputStyle: "divider" as const, raw: { input: false, output: false } };

const layoutOf = (rows: ReturnType<typeof buildConversationRows>) => rows.map((row) => row.key);

describe("buildConversationRows", () => {
  it("folds the previous step into the earlier messages and heads Input and Output", () => {
    const turn = buildSpanTurn(input, output);
    const collapsed = ["section-input", "toggle", "new-input", "input-0", "section-output", "output-0"];
    assert.deepEqual(layoutOf(buildConversationRows(turn, false, "compact", MESSAGES)), collapsed);

    const expanded = buildConversationRows(turn, true, "compact", MESSAGES);
    assert.deepEqual(layoutOf(expanded), [
      "section-input",
      "toggle",
      "system-0",
      "task-0",
      "previous-0",
      "new-input",
      "input-0",
      "section-output",
      "output-0",
    ]);
    assert.equal(expanded[1].kind === "toggle" && expanded[1].text, "Hide system prompt + 1 earlier step");
  });

  it("keeps this turn's tool results in their own input card, linked to their calls", () => {
    const rows = buildConversationRows(buildSpanTurn(input, output), false, "all", MESSAGES);
    assert.deepEqual(layoutOf(rows), ["section-input", "toggle", "new-input", "input-0", "section-output", "output-0"]);

    const result = rows.find((row) => row.kind === "message" && row.key === "input-0");
    assert.equal(result?.kind === "message" && result.normalized?.parts[0].kind, "tool-result");
    assert.deepEqual(
      result?.kind === "message" &&
        result.normalized?.parts[0].kind === "tool-result" &&
        result.normalized.parts[0].call,
      { args: {}, preview: "{}" }
    );
  });

  it("batches this turn's consecutive tool results into one card", () => {
    const parallel = [
      { role: "user", content: "task" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "c1", type: "function", function: { name: "grep", arguments: "{}" } },
          { id: "c2", type: "function", function: { name: "read_file", arguments: "{}" } },
        ],
      },
      { role: "tool", tool_call_id: "c1", content: "r1" },
      { role: "tool", tool_call_id: "c2", content: "r2" },
    ];
    const rows = buildConversationRows(buildSpanTurn(parallel, output), false, "all", {
      ...MESSAGES,
      batchResults: true,
    });
    assert.deepEqual(layoutOf(rows), ["section-input", "toggle", "new-input", "input-0", "section-output", "output-0"]);

    const batch = rows.find((row) => row.kind === "message" && row.key === "input-0");
    assert.equal(batch?.kind === "message" && batch.resultCount, 2);
  });

  it("skips the new-input marker when the whole Input section is new", () => {
    const rows = buildConversationRows(
      buildSpanTurn([{ role: "user", content: "hi" }], output),
      false,
      "all",
      MESSAGES
    );
    assert.deepEqual(layoutOf(rows), ["section-input", "input-0", "section-output", "output-0"]);
  });

  it("replaces a raw section's messages with just its header", () => {
    const rows = buildConversationRows(buildSpanTurn(input, output), false, "all", {
      ...MESSAGES,
      raw: { input: true, output: false },
    });
    assert.deepEqual(layoutOf(rows), ["section-input", "section-output", "output-0"]);
  });

  describe("merging assistant items", () => {
    const outputRows = (out: unknown) =>
      buildConversationRows(buildSpanTurn([{ role: "user", content: "go" }], out), false, "all", MESSAGES).filter(
        (row) => row.kind === "message" && row.source === "output"
      );
    const kinds = (row: ReturnType<typeof outputRows>[number]) =>
      row.kind === "message" ? row.normalized?.parts.map((p) => p.kind) : [];

    it("merges one Responses turn's reasoning, message and calls into one card", () => {
      const rows = outputRows([
        { id: "rs_1", type: "reasoning", summary: [{ type: "summary_text", text: "thinking" }], content: [] },
        {
          id: "msg_1",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "Hypotheses…", annotations: [] }],
        },
        { type: "function_call", id: "fc_1", call_id: "c1", name: "list_feature_flags", arguments: "{}" },
        { type: "function_call", id: "fc_2", call_id: "c2", name: "query_logs", arguments: '{"service":"x"}' },
      ]);

      assert.equal(rows.length, 1);
      assert.deepEqual(kinds(rows[0]), ["reasoning", "text", "tool-call", "tool-call"]);
    });

    it("keeps separate LLM calls in Responses history apart after their tool outputs are paired", () => {
      const call = (n: number) => [
        { id: `rs_${n}`, type: "reasoning", summary: [{ type: "summary_text", text: `think ${n}` }], content: [] },
        { type: "function_call", id: `fc_${n}`, call_id: `c${n}`, name: "query_logs", arguments: "{}" },
        { type: "function_call_output", call_id: `c${n}`, output: `logs ${n}` },
      ];
      const history = [{ role: "user", content: "go" }, ...call(1), ...call(2), ...call(3)];
      const rows = buildConversationRows(buildSpanTurn(history, null), true, "all", MESSAGES);

      const assistants = rows.filter((row) => row.kind === "message" && row.normalized?.role === "assistant");
      assert.equal(assistants.length, 3);
      for (const row of assistants) {
        assert.deepEqual(row.kind === "message" && row.normalized?.parts.map((p) => p.kind), [
          "reasoning",
          "tool-call",
        ]);
      }
    });

    it("keeps Chat Completions choices as separate cards", () => {
      const rows = outputRows([
        { index: 0, message: { role: "assistant", content: "answer A" }, finish_reason: "stop" },
        { index: 1, message: { role: "assistant", content: "answer B" }, finish_reason: "stop" },
      ]);
      assert.equal(rows.length, 2);
    });

    it("stops a Responses run at an item it can't flatten", () => {
      const rows = outputRows([
        { id: "rs_1", type: "reasoning", summary: [{ type: "summary_text", text: "thinking" }], content: [] },
        { id: "ws_1", type: "web_search_call", status: "completed" },
        { type: "function_call", id: "fc_1", call_id: "c1", name: "query_logs", arguments: "{}" },
      ]);
      assert.equal(rows.length, 3);
    });
  });

  it("frames new input rows instead of adding a divider for Rail / Group", () => {
    const rows = buildConversationRows(buildSpanTurn(input, output), false, "all", {
      ...MESSAGES,
      newInputStyle: "group",
    });
    assert.deepEqual(layoutOf(rows), ["section-input", "toggle", "input-0", "section-output", "output-0"]);
    const first = rows.find((row) => row.key === "input-0");
    assert.deepEqual(first?.kind === "message" && first.newInput, {
      first: true,
      last: true,
      label: { title: "Tool results from the previous step", detail: "1" },
    });
  });

  it("describes the new input in plain words", () => {
    const labelOf = (rows: ReturnType<typeof buildConversationRows>) =>
      rows.find((row) => row.kind === "new-input")?.kind === "new-input"
        ? (rows.find((row) => row.kind === "new-input") as { label: unknown }).label
        : undefined;

    assert.deepEqual(labelOf(buildConversationRows(buildSpanTurn(input, output), false, "all", MESSAGES)), {
      title: "Tool results from the previous step",
      detail: "1",
    });

    const followUp = [...input, { role: "assistant", content: "found it" }, { role: "user", content: "now fix it" }];
    assert.deepEqual(labelOf(buildConversationRows(buildSpanTurn(followUp, output), false, "all", MESSAGES)), {
      title: "New user message",
    });
  });
});

describe("buildFocusedRows", () => {
  const RAW_OFF = { input: false, output: false };
  const keys = (rows: ReturnType<typeof buildFocusedRows>) => rows.map((row) => row.key);

  it("folds system prompt and earlier steps into Context and keeps only new input in Input", () => {
    const rows = buildFocusedRows(buildSpanTurn(input, output), false, RAW_OFF);
    assert.deepEqual(keys(rows), ["context", "section-input", "input-0", "section-output", "output-0"]);

    const context = rows[0];
    assert.equal(context.kind === "context" && context.summary, "system prompt + 1 earlier step");
    const header = rows[1];
    assert.equal(header.kind === "section" && header.summary, "1 tool result");
    const result = rows[2];
    assert.equal(result.kind === "message" && result.plainResults, true);
    assert.equal(result.kind === "message" && result.resultCount, undefined);
  });

  it("opens Context to the system prompt, task and earlier steps", () => {
    const rows = buildFocusedRows(buildSpanTurn(input, output), true, RAW_OFF);
    assert.deepEqual(keys(rows), [
      "context",
      "system-0",
      "task-0",
      "previous-0",
      "section-input",
      "input-0",
      "section-output",
      "output-0",
    ]);
  });

  it("drops Context when Input shows the raw payload", () => {
    const rows = buildFocusedRows(buildSpanTurn(input, output), false, { input: true, output: false });
    assert.deepEqual(keys(rows), ["section-input", "section-output", "output-0"]);
  });
});
