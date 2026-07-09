import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";

// Keep the plugin's log/state out of the real ~/.claude/state during tests.
process.env.CC_LMNR_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "lmnr-testlog-"));

import { getPendingAgentToolUseIds, getTurnsToEmit } from "../src/deferral.js";
import { SessionState } from "../src/state.js";
import { extractTextFromContent, getUsageDetailsFromRow, readNewJsonl, truncateText } from "../src/transcript.js";
import { buildTurns, mergeAssistantRows } from "../src/turns.js";
import { assistantRow, toolResultRow, userRow } from "./helpers.js";

describe("buildTurns", () => {
  it("simple turn", () => {
    const turns = buildTurns([userRow("hello"), assistantRow([{ type: "text", text: "hi there" }])]);
    assert.equal(turns.length, 1);
    assert.equal(extractTextFromContent(turns[0]!.userMsg.message.content), "hello");
    assert.equal(turns[0]!.assistantMsgs.length, 1);
  });

  it("two turns", () => {
    const turns = buildTurns([
      userRow("first"),
      assistantRow([{ type: "text", text: "one" }], { msgId: "m1" }),
      userRow("second", "2026-07-08T10:01:00.000Z"),
      assistantRow([{ type: "text", text: "two" }], { msgId: "m2", ts: "2026-07-08T10:01:05.000Z" }),
    ]);
    assert.equal(turns.length, 2);
  });

  it("tool use turn", () => {
    const turns = buildTurns([
      userRow("run ls"),
      assistantRow(
        [
          { type: "text", text: "running" },
          { type: "tool_use", id: "tu_1", name: "Bash", input: { command: "ls" } },
        ],
        { msgId: "m1" }
      ),
      toolResultRow("tu_1", "file.txt"),
      assistantRow([{ type: "text", text: "done" }], { msgId: "m2", ts: "2026-07-08T10:00:15.000Z" }),
    ]);
    assert.equal(turns.length, 1);
    const turn = turns[0]!;
    assert.equal(turn.assistantMsgs.length, 2);
    assert.equal(turn.toolResultsById["tu_1"]!.content, "file.txt");
  });

  it("isMeta rows do not start turns", () => {
    const turns = buildTurns([
      userRow("real prompt"),
      userRow("injected caveat", "2026-07-08T10:00:00.000Z", { isMeta: true }),
      assistantRow([{ type: "text", text: "reply" }]),
    ]);
    assert.equal(turns.length, 1);
    assert.equal(extractTextFromContent(turns[0]!.userMsg.message.content), "real prompt");
  });

  it("injected skill content keyed by tool_use", () => {
    const turns = buildTurns([
      userRow("use skill"),
      assistantRow([{ type: "tool_use", id: "tu_skill", name: "Skill", input: { skill: "coding" } }]),
      {
        type: "user",
        isMeta: true,
        sourceToolUseID: "tu_skill",
        message: { role: "user", content: "skill instructions" },
        timestamp: "2026-07-08T10:00:07.000Z",
      },
      toolResultRow("tu_skill", "ok"),
      assistantRow([{ type: "text", text: "done" }], { msgId: "m2" }),
    ]);
    assert.equal(turns[0]!.injectedByToolId["tu_skill"], "skill instructions");
  });

  it("assistant rows merged by message.id", () => {
    const turns = buildTurns([
      userRow("go"),
      assistantRow([{ type: "text", text: "part1" }], { msgId: "m1" }),
      assistantRow([{ type: "tool_use", id: "tu_1", name: "Bash", input: {} }], { msgId: "m1" }),
    ]);
    assert.equal(turns[0]!.assistantMsgs.length, 1);
    assert.equal(turns[0]!.assistantMsgs[0]!.message.content.length, 2);
  });

  it("assistant before user ignored", () => {
    const turns = buildTurns([
      assistantRow([{ type: "text", text: "orphan" }]),
      userRow("hello"),
      assistantRow([{ type: "text", text: "hi" }], { msgId: "m2" }),
    ]);
    assert.equal(turns.length, 1);
  });

  it("turn without assistant dropped", () => {
    assert.deepEqual(buildTurns([userRow("no reply yet")]), []);
  });
});

describe("mergeAssistantRows", () => {
  it("string content wrapped", () => {
    const merged = mergeAssistantRows([
      { message: { id: "m", role: "assistant", content: "text a" } },
      { message: { id: "m", role: "assistant", content: [{ type: "text", text: "b" }] } },
    ]);
    const content = merged.message.content;
    assert.deepEqual(content[0], { type: "text", text: "text a" });
    assert.deepEqual(content[1], { type: "text", text: "b" });
  });
});

describe("usage", () => {
  it("usage extracted", () => {
    const row = assistantRow([{ type: "text", text: "x" }]);
    row.message.usage = {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 2000,
      cache_creation_input_tokens: 300,
    };
    assert.deepEqual(getUsageDetailsFromRow(row), {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 2000,
      cache_creation_input_tokens: 300,
    });
  });

  it("zero and missing skipped", () => {
    const row = assistantRow([{ type: "text", text: "x" }]);
    row.message.usage = { input_tokens: 0, output_tokens: 7 };
    assert.deepEqual(getUsageDetailsFromRow(row), { output_tokens: 7 });
  });

  it("no usage", () => {
    const row = assistantRow([{ type: "text", text: "x" }]);
    delete row.message.usage;
    assert.equal(getUsageDetailsFromRow(row), null);
  });
});

describe("truncate", () => {
  it("no truncation", () => {
    const [text, meta] = truncateText("short");
    assert.equal(text, "short");
    assert.equal(meta.truncated, false);
  });

  it("truncation", () => {
    const [text, meta] = truncateText("a".repeat(30000), 100);
    assert.equal(text.length, 100);
    assert.equal(meta.truncated, true);
    assert.equal(meta.orig_len, 30000);
    assert.ok(meta.sha256);
  });
});

describe("async agent deferral", () => {
  const asyncAgentTurnRows = () => [
    userRow("launch agent"),
    assistantRow([{ type: "tool_use", id: "tu_agent", name: "Agent", input: { prompt: "do work" } }]),
    toolResultRow("tu_agent", "Async agent launched successfully", "2026-07-08T10:00:10.000Z", {
      toolUseResult: { status: "async_launched" },
    }),
    assistantRow([{ type: "text", text: "launched, waiting" }], { msgId: "m2" }),
  ];

  it("async turn deferred", () => {
    const turns = buildTurns(asyncAgentTurnRows());
    assert.deepEqual(getPendingAgentToolUseIds(turns[0]!), ["tu_agent"]);

    const state = new SessionState();
    const toEmit = getTurnsToEmit(turns, state);
    assert.deepEqual(toEmit, []);
    assert.equal(state.pendingAgentTurns.length, 1);
    assert.deepEqual(state.pendingAgentTurns[0]!.pendingToolUseIds, ["tu_agent"]);
  });

  it("async turn flushed at session end", () => {
    const turns = buildTurns(asyncAgentTurnRows());
    const state = new SessionState();
    const toEmit = getTurnsToEmit(turns, state, true);
    assert.equal(toEmit.length, 1);
  });

  it("sync agent not deferred", () => {
    const turns = buildTurns([
      userRow("run agent"),
      assistantRow([{ type: "tool_use", id: "tu_sync", name: "Task", input: {} }]),
      toolResultRow("tu_sync", "agent finished: result text"),
      assistantRow([{ type: "text", text: "summary" }], { msgId: "m2" }),
    ]);
    assert.deepEqual(getPendingAgentToolUseIds(turns[0]!), []);
  });

  it("task notification resolves tool result", () => {
    const notification =
      "<task-notification><tool-use-id>tu_agent</tool-use-id>" +
      "<result>agent output here</result></task-notification>";
    const rows = [
      ...asyncAgentTurnRows(),
      userRow(notification, "2026-07-08T10:05:00.000Z"),
      assistantRow([{ type: "text", text: "agent done" }], { msgId: "m3", ts: "2026-07-08T10:05:05.000Z" }),
    ];
    const turns = buildTurns(rows);
    assert.equal(turns.length, 1);
    const entry = turns[0]!.toolResultsById["tu_agent"]!;
    assert.equal(entry.finalContent, "agent output here");
    assert.deepEqual(getPendingAgentToolUseIds(turns[0]!), []);
  });
});

describe("readNewJsonl", () => {
  const withTmp = (fn: (dir: string) => void) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lmnr-test-"));
    try {
      fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  it("incremental read", () => {
    withTmp((dir) => {
      const p = path.join(dir, "t.jsonl");
      fs.writeFileSync(p, JSON.stringify({ a: 1 }) + "\n");
      const state = new SessionState();
      let msgs;
      [msgs] = readNewJsonl(p, state);
      assert.deepEqual(msgs, [{ a: 1 }]);

      fs.appendFileSync(p, JSON.stringify({ b: 2 }) + "\n");
      [msgs] = readNewJsonl(p, state);
      assert.deepEqual(msgs, [{ b: 2 }]);
    });
  });

  it("partial line buffered", () => {
    withTmp((dir) => {
      const p = path.join(dir, "t.jsonl");
      fs.writeFileSync(p, '{"a": 1}\n{"b":');
      const state = new SessionState();
      let msgs;
      [msgs] = readNewJsonl(p, state);
      assert.deepEqual(msgs, [{ a: 1 }]);
      assert.equal(state.buffer, '{"b":');

      fs.appendFileSync(p, " 2}\n");
      [msgs] = readNewJsonl(p, state);
      assert.deepEqual(msgs, [{ b: 2 }]);
    });
  });

  it("complete unterminated final line flushed at session end", () => {
    withTmp((dir) => {
      const p = path.join(dir, "t.jsonl");
      // No trailing newline: the final row would otherwise sit in the buffer
      // forever once offset reaches EOF.
      fs.writeFileSync(p, '{"a": 1}\n{"b": 2}');
      const state = new SessionState();
      let msgs;
      [msgs] = readNewJsonl(p, state);
      assert.deepEqual(msgs, [{ a: 1 }]);
      assert.equal(state.buffer, '{"b": 2}');

      // Later runs read zero new bytes; without flushing the row stays held.
      [msgs] = readNewJsonl(p, state);
      assert.deepEqual(msgs, []);

      [msgs] = readNewJsonl(p, state, true);
      assert.deepEqual(msgs, [{ b: 2 }]);
      assert.equal(state.buffer, "");
    });
  });

  it("genuinely partial line stays buffered even when flushing", () => {
    withTmp((dir) => {
      const p = path.join(dir, "t.jsonl");
      fs.writeFileSync(p, '{"a": 1}\n{"b":');
      const state = new SessionState();
      readNewJsonl(p, state);

      const [msgs] = readNewJsonl(p, state, true);
      assert.deepEqual(msgs, []);
      assert.equal(state.buffer, '{"b":');
    });
  });

  it("shrunk file restarts", () => {
    withTmp((dir) => {
      const p = path.join(dir, "t.jsonl");
      fs.writeFileSync(p, '{"a": 1}\n{"b": 2}\n');
      const state = new SessionState();
      readNewJsonl(p, state);

      fs.writeFileSync(p, '{"c": 3}\n');
      const [msgs] = readNewJsonl(p, state);
      assert.deepEqual(msgs, [{ c: 3 }]);
    });
  });
});
