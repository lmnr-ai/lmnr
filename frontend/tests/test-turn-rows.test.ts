import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildRows } from "@/components/traces/span-view/span-turn/build-rows";
import { buildSpanTurn } from "@/lib/spans/turn";

const call = (id: string, name = "grep") => ({ id, type: "function", function: { name, arguments: "{}" } });
const input = [
  { role: "system", content: "sys" },
  { role: "user", content: "task" },
  { role: "assistant", content: null, tool_calls: [call("c1")] },
  { role: "tool", tool_call_id: "c1", content: "3 matches" },
];
const output = [{ role: "assistant", content: "done" }];

const RAW_OFF = { input: false, output: false };
type Rows = ReturnType<typeof buildRows>;
const keys = (rows: Rows) => rows.map((row) => row.key);
const message = (rows: Rows, key: string) => {
  const row = rows.find((r) => r.key === key);
  return row?.kind === "message" ? row : undefined;
};

describe("buildRows", () => {
  it("folds system prompt and earlier steps into Context and keeps only new input in Input", () => {
    const rows = buildRows(buildSpanTurn(input, output), false, RAW_OFF);
    assert.deepEqual(keys(rows), ["context", "section-input", "input-0", "section-output", "output-0"]);

    const [context, header] = rows;
    assert.equal(context.kind === "context" && context.summary, "system prompt + 1 earlier step");
    assert.equal(header.kind === "section" && header.summary, "1 tool result");
    assert.equal(message(rows, "input-0")?.plainResults, true);
  });

  it("opens Context to the system prompt, task and earlier steps", () => {
    const rows = buildRows(buildSpanTurn(input, output), true, RAW_OFF);
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

  it("links this call's tool results to the calls they answer", () => {
    const part = message(buildRows(buildSpanTurn(input, output), false, RAW_OFF), "input-0")?.normalized?.parts[0];
    assert.equal(part?.kind, "tool-result");
    assert.deepEqual(part?.kind === "tool-result" && part.call, { args: {} });
  });

  it("puts this call's consecutive tool results in one card", () => {
    const parallel = [
      { role: "user", content: "task" },
      { role: "assistant", content: null, tool_calls: [call("c1"), call("c2", "read_file")] },
      { role: "tool", tool_call_id: "c1", content: "r1" },
      { role: "tool", tool_call_id: "c2", content: "r2" },
    ];
    const rows = buildRows(buildSpanTurn(parallel, output), false, RAW_OFF);
    assert.deepEqual(keys(rows), ["context", "section-input", "input-0", "section-output", "output-0"]);
    assert.equal(message(rows, "input-0")?.normalized?.parts.length, 2);
    const header = rows[1];
    assert.equal(header.kind === "section" && header.summary, "2 tool results");
  });

  it("calls a plain follow-up a user message", () => {
    const followUp = [...input, { role: "assistant", content: "found it" }, { role: "user", content: "now fix it" }];
    const header = buildRows(buildSpanTurn(followUp, output), false, RAW_OFF).find((row) => row.kind === "section");
    assert.equal(header?.kind === "section" && header.summary, "1 user message");
  });

  it("skips Context when the whole input is new", () => {
    const rows = buildRows(buildSpanTurn([{ role: "user", content: "hi" }], output), false, RAW_OFF);
    assert.deepEqual(keys(rows), ["section-input", "input-0", "section-output", "output-0"]);
  });

  it("drops Context and messages when Input shows the raw payload", () => {
    const rows = buildRows(buildSpanTurn(input, output), false, { input: true, output: false });
    assert.deepEqual(keys(rows), ["section-input", "section-output", "output-0"]);
  });

  describe("merging assistant items", () => {
    const outputRows = (out: unknown) =>
      buildRows(buildSpanTurn([{ role: "user", content: "go" }], out), false, RAW_OFF).filter(
        (row) => row.kind === "message" && row.source === "output"
      );
    const kinds = (row: Rows[number]) => (row.kind === "message" ? row.normalized?.parts.map((p) => p.kind) : []);

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
      const step = (n: number) => [
        { id: `rs_${n}`, type: "reasoning", summary: [{ type: "summary_text", text: `think ${n}` }], content: [] },
        { type: "function_call", id: `fc_${n}`, call_id: `c${n}`, name: "query_logs", arguments: "{}" },
        { type: "function_call_output", call_id: `c${n}`, output: `logs ${n}` },
      ];
      const history = [{ role: "user", content: "go" }, ...step(1), ...step(2), ...step(3)];
      const rows = buildRows(buildSpanTurn(history, null), true, RAW_OFF);

      const assistants = rows.filter((row) => row.kind === "message" && row.normalized?.role === "assistant");
      assert.equal(assistants.length, 3);
      for (const row of assistants) assert.deepEqual(kinds(row), ["reasoning", "tool-call"]);
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
});
