import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";

// Keep the plugin's log/state out of the real ~/.codex during tests.
const BASELINE_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "lmnr-codex-testlog-"));
process.env.CODEX_LMNR_STATE_DIR = BASELINE_STATE_DIR;

import { getNewTurnsFromRollout } from "../src/emit.js";
import { readNewJsonl } from "../src/rollout.js";
import { SessionState } from "../src/state.js";
import { buildTurns, mapUsage, parseArguments } from "../src/turns.js";
import {
  assistantMessageLine,
  functionCallLine,
  functionCallOutputLine,
  line,
  reasoningLine,
  sessionMetaLine,
  taskCompleteLine,
  taskStartedLine,
  tokenCountLine,
  turnContextLine,
  userMessageLine,
} from "./helpers.js";

describe("buildTurns", () => {
  it("assembles a simple turn: user -> assistant -> task_complete", () => {
    const { turns } = buildTurns([
      sessionMetaLine(),
      turnContextLine("gpt-5.2-codex"),
      taskStartedLine(),
      userMessageLine("hello"),
      assistantMessageLine("hi there"),
      taskCompleteLine("hi there"),
    ]);
    assert.equal(turns.length, 1);
    const turn = turns[0]!;
    assert.equal(turn.userText, "hello");
    assert.equal(turn.model, "gpt-5.2-codex");
    assert.equal(turn.completed, true);
    assert.equal(turn.lastAssistantText, "hi there");
    assert.equal(turn.steps.length, 1);
    assert.equal(turn.steps[0]!.assistantText, "hi there");
  });

  it("splits steps on tool outputs and joins tool calls with results", () => {
    const { turns } = buildTurns([
      turnContextLine(),
      userMessageLine("list files"),
      reasoningLine("I should list files"),
      functionCallLine("shell", { command: ["ls"] }, "call_1"),
      functionCallOutputLine("call_1", "file1\nfile2"),
      assistantMessageLine("There are two files"),
      taskCompleteLine(),
    ]);
    assert.equal(turns.length, 1);
    const turn = turns[0]!;
    assert.equal(turn.steps.length, 2);
    const step1 = turn.steps[0]!;
    assert.equal(step1.reasoningText, "I should list files");
    assert.equal(step1.toolCalls.length, 1);
    assert.equal(step1.toolCalls[0]!.name, "shell");
    assert.deepEqual(step1.toolCalls[0]!.input, { command: ["ls"] });
    assert.equal(step1.toolCalls[0]!.output, "file1\nfile2");
    assert.equal(turn.steps[1]!.assistantText, "There are two files");
  });

  it("does not start turns on injected context user messages", () => {
    const { turns } = buildTurns([
      turnContextLine(),
      userMessageLine("<environment_context>\ncwd: /x\n</environment_context>"),
      userMessageLine("<user_instructions>be nice</user_instructions>"),
      userMessageLine("real prompt"),
      assistantMessageLine("answer"),
      taskCompleteLine(),
    ]);
    assert.equal(turns.length, 1);
    assert.equal(turns[0]!.userText, "real prompt");
  });

  it("skips event_msg duplicates of user/assistant messages", () => {
    const { turns } = buildTurns([
      turnContextLine(),
      line("event_msg", { type: "user_message", message: "hello" }),
      userMessageLine("hello"),
      assistantMessageLine("hi"),
      line("event_msg", { type: "agent_message", message: "hi" }),
      taskCompleteLine(),
    ]);
    assert.equal(turns.length, 1);
    assert.equal(turns[0]!.steps.length, 1);
  });

  it("attaches last_token_usage to the latest step with Laminar key names", () => {
    const { turns } = buildTurns([
      turnContextLine(),
      userMessageLine("hi"),
      assistantMessageLine("hello"),
      tokenCountLine({ input_tokens: 100, cached_input_tokens: 40, output_tokens: 20, reasoning_output_tokens: 5 }),
      taskCompleteLine(),
    ]);
    const usage = turns[0]!.steps[0]!.usage;
    assert.deepEqual(usage, {
      input_tokens: 100,
      cache_read_input_tokens: 40,
      output_tokens: 20,
      reasoning_tokens: 5,
    });
  });

  it("carries model across batches and marks aborted turns", () => {
    const first = buildTurns([turnContextLine("gpt-5.2-codex"), userMessageLine("q1"), assistantMessageLine("a1"), taskCompleteLine()]);
    assert.equal(first.lastModel, "gpt-5.2-codex");
    const second = buildTurns(
      [userMessageLine("q2"), assistantMessageLine("a2"), line("event_msg", { type: "turn_aborted", reason: "interrupted" })],
      first.lastModel
    );
    assert.equal(second.turns.length, 1);
    assert.equal(second.turns[0]!.model, "gpt-5.2-codex");
    assert.equal(second.turns[0]!.aborted, true);
    assert.equal(second.turns[0]!.completed, true);
  });

  it("handles local_shell_call, custom_tool_call and web_search_call", () => {
    const { turns } = buildTurns([
      turnContextLine(),
      userMessageLine("go"),
      line("response_item", { type: "local_shell_call", call_id: "c1", status: "completed", action: { type: "exec", command: ["echo", "x"] } }),
      line("response_item", { type: "custom_tool_call", call_id: "c2", name: "apply_patch", input: "*** Begin Patch" }),
      line("response_item", { type: "web_search_call", id: "ws1", action: { type: "search", query: "laminar" } }),
      line("response_item", { type: "custom_tool_call_output", call_id: "c2", output: "Done" }),
      assistantMessageLine("finished"),
      taskCompleteLine(),
    ]);
    const calls = turns[0]!.steps[0]!.toolCalls;
    assert.equal(calls.length, 3);
    assert.equal(calls[0]!.name, "shell");
    assert.equal(calls[1]!.name, "apply_patch");
    assert.equal(calls[1]!.output, "Done");
    assert.equal(calls[2]!.name, "web_search");
  });

  it("skips unknown line and item types gracefully", () => {
    const { turns } = buildTurns([
      line("world_state", { anything: 1 }),
      line("compacted", { message: "summary" }),
      line("response_item", { type: "brand_new_item", foo: "bar" }),
      turnContextLine(),
      userMessageLine("hi"),
      assistantMessageLine("hello"),
      taskCompleteLine(),
    ]);
    assert.equal(turns.length, 1);
  });

  it("uses task_complete last_agent_message as fallback assistant text", () => {
    const { turns } = buildTurns([
      turnContextLine(),
      userMessageLine("do it"),
      functionCallLine("shell", { command: ["true"] }, "c1"),
      functionCallOutputLine("c1", "ok"),
      taskCompleteLine("All done."),
    ]);
    assert.equal(turns[0]!.lastAssistantText, "All done.");
  });
});

describe("parseArguments / mapUsage", () => {
  it("double-parses stringified JSON arguments with fallback", () => {
    assert.deepEqual(parseArguments('{"a":1}'), { a: 1 });
    assert.equal(parseArguments("not json"), "not json");
    assert.deepEqual(parseArguments({ a: 2 }), { a: 2 });
  });

  it("mapUsage drops zero/absent values and returns null when empty", () => {
    assert.equal(mapUsage({ input_tokens: 0, output_tokens: 0 }), null);
    assert.equal(mapUsage(null), null);
    assert.deepEqual(mapUsage({ input_tokens: 3 }), { input_tokens: 3 });
  });
});

describe("incremental rollout reading", () => {
  const writeRollout = (rows: any[], trailingNewline = true): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lmnr-codex-rollout-"));
    const file = path.join(dir, "rollout-2026-07-09T10-00-00-5973b6c0-94b8-487b-a530-2aeb6098ae0e.jsonl");
    fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + (trailingNewline ? "\n" : ""), "utf-8");
    return file;
  };

  it("reads rows incrementally by byte offset", () => {
    const rows = [sessionMetaLine(), turnContextLine(), userMessageLine("hi")];
    const file = writeRollout(rows);
    let state = new SessionState();
    let batch: any[];
    [batch, state] = readNewJsonl(file, state);
    assert.equal(batch.length, 3);

    fs.appendFileSync(file, JSON.stringify(assistantMessageLine("hello")) + "\n");
    [batch, state] = readNewJsonl(file, state);
    assert.equal(batch.length, 1);
    assert.equal(batch[0].payload.role, "assistant");
  });

  it("buffers a partial trailing line and flushes complete unterminated final line", () => {
    const rows = [sessionMetaLine(), userMessageLine("hi")];
    const file = writeRollout(rows, false); // no trailing newline
    let state = new SessionState();
    let batch: any[];
    [batch, state] = readNewJsonl(file, state);
    // Last line has no newline -> held in buffer.
    assert.equal(batch.length, 1);
    assert.ok(state.buffer.length > 0);
    // Flush mode parses the buffered complete line.
    [batch, state] = readNewJsonl(file, state, true);
    assert.equal(batch.length, 1);
    assert.equal(state.buffer, "");
  });

  it("holds an incomplete trailing turn and replays it on the next run", () => {
    const file = writeRollout([
      sessionMetaLine(),
      turnContextLine(),
      userMessageLine("q1"),
      assistantMessageLine("a1"),
      taskCompleteLine(),
      userMessageLine("q2"),
    ]);
    let state = new SessionState();
    let turns: any[];
    [turns, state] = getNewTurnsFromRollout(file, state);
    assert.equal(turns.length, 1);
    assert.equal(turns[0].userText, "q1");
    assert.ok(state.pendingTurnRows.length > 0);

    fs.appendFileSync(file, [assistantMessageLine("a2"), taskCompleteLine()].map((r) => JSON.stringify(r)).join("\n") + "\n");
    [turns, state] = getNewTurnsFromRollout(file, state);
    assert.equal(turns.length, 1);
    assert.equal(turns[0].userText, "q2");
    assert.equal(turns[0].lastAssistantText, "a2");
    assert.equal(state.pendingTurnRows.length, 0);
  });

  it("captures session meta once (first session_meta wins over fork-copied ones)", () => {
    const file = writeRollout([
      sessionMetaLine(),
      sessionMetaLine({ id: "other-id", cwd: "/elsewhere" }),
      turnContextLine(),
      userMessageLine("q"),
      assistantMessageLine("a"),
      taskCompleteLine(),
    ]);
    const state = new SessionState();
    const [, newState] = getNewTurnsFromRollout(file, state);
    assert.equal(newState.meta.threadId, "5973b6c0-94b8-487b-a530-2aeb6098ae0e");
    assert.equal(newState.meta.cwd, "/home/dev/project");
    assert.equal(newState.meta.branch, "main");
  });

  it("restarts when the rollout shrinks (rotation)", () => {
    const file = writeRollout([sessionMetaLine(), userMessageLine("long long long prompt")]);
    let state = new SessionState();
    [, state] = readNewJsonl(file, state);
    fs.writeFileSync(file, JSON.stringify(userMessageLine("new")) + "\n", "utf-8");
    const [batch] = readNewJsonl(file, state);
    assert.equal(batch.length, 1);
  });
});
