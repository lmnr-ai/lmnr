import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type ProcessedMessages } from "@/lib/spans/process-messages";
import { buildSpanTurn } from "@/lib/spans/turn";

const contents = (processed?: ProcessedMessages) =>
  (processed?.messages as { content: unknown }[] | undefined)?.map((m) => m.content);

describe("buildSpanTurn", () => {
  it("splits an agent loop at the last assistant message", () => {
    const input = [
      { role: "system", content: "sys" },
      { role: "user", content: "task" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "more" },
      { role: "assistant", content: "a2" },
      { role: "tool", content: "r1", tool_call_id: "1" },
      { role: "tool", content: "r2", tool_call_id: "2" },
    ];
    const turn = buildSpanTurn(input, [{ role: "assistant", content: "done" }]);

    assert.deepEqual(contents(turn.system), ["sys"]);
    assert.deepEqual(contents(turn.task), ["task"]);
    assert.deepEqual(contents(turn.history), ["a1", "more"]);
    assert.deepEqual(contents(turn.previous), ["a2"]);
    assert.deepEqual(contents(turn.input), ["r1", "r2"]);
    assert.deepEqual(contents(turn.output), ["done"]);
  });

  it("treats everything after the system prompt as new when there is no assistant message", () => {
    const turn = buildSpanTurn(
      [
        { role: "developer", content: "sys" },
        { role: "user", content: "a" },
        { role: "user", content: "b" },
      ],
      null
    );

    assert.deepEqual(contents(turn.system), ["sys"]);
    assert.equal(turn.history, undefined);
    assert.equal(turn.previous, undefined);
    assert.deepEqual(contents(turn.input), ["a", "b"]);
    assert.equal(turn.output, undefined);
  });

  it("keeps a consecutive assistant run together as the previous step", () => {
    const turn = buildSpanTurn(
      [
        { role: "user", parts: [{ text: "q" }] },
        { role: "model", parts: [{ text: "thinking" }] },
        { role: "model", parts: [{ text: "call" }] },
        { role: "user", parts: [{ text: "result" }] },
      ],
      null
    );

    assert.equal(turn.previous?.messages.length, 2);
    assert.equal(turn.input?.messages.length, 1);
    assert.equal(turn.task?.messages.length, 1);
    assert.equal(turn.history, undefined);
  });

  it("detects input and output formats independently", () => {
    const input = [{ role: "user", content: "What is the weather in San Francisco?" }];
    const output = [
      {
        role: "assistant",
        content: [{ id: "toolu_1", input: { location: "SF" }, name: "get_weather", type: "tool_use" }],
        stop_reason: "tool_use",
      },
    ];
    const turn = buildSpanTurn(input, output);

    assert.equal(turn.input?.type, "openai");
    assert.equal(turn.output?.type, "anthropic");
  });

  it("returns only output when input is missing", () => {
    const turn = buildSpanTurn(undefined, JSON.stringify([{ role: "assistant", content: "hi" }]));

    assert.deepEqual(Object.keys(turn).sort(), ["earlierSteps", "output"]);
    assert.deepEqual(contents(turn.output), ["hi"]);
  });

  it("counts earlier model calls as steps, not raw entries", () => {
    // Responses: each call is reasoning + function_call + function_call_output (3 entries, 1 step).
    const step = (n: number) => [
      { id: `rs_${n}`, type: "reasoning", summary: [], content: [] },
      { type: "function_call", id: `fc_${n}`, call_id: `c${n}`, name: "f", arguments: "{}" },
      { type: "function_call_output", call_id: `c${n}`, output: "ok" },
    ];
    const turn = buildSpanTurn([{ role: "user", content: "go" }, ...step(1), ...step(2), ...step(3)], null);
    assert.equal(turn.earlierSteps, 3);
  });
});
