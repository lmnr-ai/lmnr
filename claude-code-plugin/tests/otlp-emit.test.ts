import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";

// Keep the plugin's log/state out of the real ~/.claude/state during tests.
const BASELINE_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "lmnr-testlog-"));
process.env.CC_LMNR_STATE_DIR = BASELINE_STATE_DIR;

import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { JsonTraceSerializer } from "@opentelemetry/otlp-transformer";

import type { LaminarConfig } from "../src/config.js";
import {
  emitNewTurnsFromTranscript,
  emitReadyTurns,
  emitTurn,
} from "../src/emit.js";
import {
  getSessionState,
  getSessionStateKey,
  loadHookState,
  SessionState,
} from "../src/state.js";
import type { SubagentTranscript } from "../src/subagents.js";
import { TraceEmitter } from "../src/tracer.js";
import { buildTurns, type Turn } from "../src/turns.js";
import { assistantRow, spansByName, toolResultRow, userRow } from "./helpers.js";

function makeEmitter(userId: string | null = null): TraceEmitter {
  const config: LaminarConfig = { apiKey: "k", baseUrl: "http://localhost:1", userId };
  return new TraceEmitter(config);
}

function attrs(span: ReadableSpan): Record<string, any> {
  return span.attributes;
}

function hrToNs(hr: [number, number]): bigint {
  return BigInt(hr[0]) * 1_000_000_000n + BigInt(hr[1]);
}

describe("OTLP format", () => {
  it("ids are valid hex", () => {
    const emitter = makeEmitter();
    const turns = buildTurns([userRow("hello"), assistantRow([{ type: "text", text: "hi" }])]);
    emitTurn(emitter, emitter.config, "sess", 1, turns[0]!, "/tmp/session.jsonl");
    const span = emitter.spans[0]!;
    assert.match(span.spanContext().traceId, /^[0-9a-f]{32}$/);
    assert.match(span.spanContext().spanId, /^[0-9a-f]{16}$/);
  });

  it("wire-format envelope (camelCase, intValue string, arrayValue)", () => {
    const emitter = makeEmitter();
    const turns = buildTurns([
      userRow("use a skill"),
      assistantRow([{ type: "tool_use", id: "tu_s", name: "Skill", input: { skill: "coding" } }]),
      toolResultRow("tu_s", "ok"),
      assistantRow([{ type: "text", text: "done" }], { msgId: "m2" }),
    ]);
    emitTurn(emitter, emitter.config, "0123abcd-0000-4000-8000-000000000000", 1, turns[0]!, "/tmp/session.jsonl");

    const bytes = JsonTraceSerializer.serializeRequest(emitter.spans);
    const payload = JSON.parse(Buffer.from(bytes!).toString("utf-8"));
    const wireSpans = payload.resourceSpans[0].scopeSpans[0].spans;
    const byName: Record<string, any> = {};
    for (const s of wireSpans) {
      byName[s.name] = s;
    }

    // camelCase + hex ids + decimal-string nanoseconds.
    const root = byName["Claude Code - Turn 1 (0123abcd)"];
    assert.match(root.traceId, /^[0-9a-f]{32}$/);
    assert.match(root.spanId, /^[0-9a-f]{16}$/);
    assert.equal(typeof root.startTimeUnixNano, "string");

    const wireAttr = (span: any, key: string) => span.attributes.find((a: any) => a.key === key)?.value;
    // string envelope
    assert.deepEqual(wireAttr(root, "lmnr.span.type"), { stringValue: "DEFAULT" });
    // arrayValue for tags
    const tags = wireAttr(root, "lmnr.association.properties.tags");
    assert.ok(tags.arrayValue.values.some((v: any) => v.stringValue === "skill:coding"));

    // intValue for token usage on the LLM span. The OTel JS serializer emits a
    // JSON number here; app-server's OTLP/JSON decoder accepts intValue as
    // either a number or a decimal string, so this is a valid wire form.
    const llm = byName["LLM Call 1"];
    assert.equal(Number(wireAttr(llm, "gen_ai.usage.input_tokens").intValue), 10);
  });
});

describe("emitReadyTurns", () => {
  const makeTurns = (n: number): Turn[] => {
    const turns: Turn[] = [];
    for (let i = 0; i < n; i++) {
      turns.push(
        ...buildTurns([userRow(`prompt ${i}`), assistantRow([{ type: "text", text: `answer ${i}` }], { msgId: `m${i}` })])
      );
    }
    return turns;
  };

  const emitReady = (turns: Turn[], state: SessionState, emitTurnFn?: typeof emitTurn) => {
    const emitter = makeEmitter();
    return emitReadyTurns(emitter, emitter.config, "sess", "/tmp/session.jsonl", turns, state, {}, emitTurnFn ?? emitTurn);
  };

  it("counts all successful turns", () => {
    assert.equal(emitReady(makeTurns(3), new SessionState()), 3);
  });

  it("failed emit not counted (turn numbering)", () => {
    const calls: number[] = [];
    const flaky: typeof emitTurn = (_e, _c, _s, turnNum) => {
      calls.push(turnNum);
      if (calls.length === 2) {
        throw new Error("boom");
      }
    };
    assert.equal(emitReady(makeTurns(3), new SessionState({ turnCount: 5 }), flaky), 2);
    // Turn numbers only advance for successful emits, so the turn after a
    // failure reuses the failed slot's number.
    assert.deepEqual(calls, [6, 7, 7]);
  });

  it("all emits failed counts zero", () => {
    const failing: typeof emitTurn = () => {
      throw new Error("boom");
    };
    assert.equal(emitReady(makeTurns(2), new SessionState(), failing), 0);
  });
});

describe("emitNewTurnsFromTranscript", () => {
  let stateDir: string | null = null;

  const setup = (): string => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "lmnr-state-"));
    process.env.CC_LMNR_STATE_DIR = stateDir;
    const transcript = path.join(stateDir, "session.jsonl");
    const rows = [userRow("hello"), assistantRow([{ type: "text", text: "hi" }])];
    fs.writeFileSync(transcript, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    return transcript;
  };

  afterEach(() => {
    process.env.CC_LMNR_STATE_DIR = BASELINE_STATE_DIR;
    if (stateDir) {
      fs.rmSync(stateDir, { recursive: true, force: true });
      stateDir = null;
    }
  });

  const run = (transcript: string, exportOk: boolean) => {
    const emitter = makeEmitter();
    return emitNewTurnsFromTranscript(emitter, emitter.config, "sess", transcript, {
      exportFn: async () => exportOk,
    });
  };

  const savedState = (transcript: string): SessionState => {
    const state = loadHookState();
    const key = getSessionStateKey("sess", transcript);
    return getSessionState(state, key);
  };

  it("export failure keeps state for retry", async () => {
    const transcript = setup();
    assert.equal(await run(transcript, false), 0);
    let saved = savedState(transcript);
    assert.equal(saved.offset, 0);
    assert.equal(saved.turnCount, 0);

    // Next run with a working export re-reads the same turn.
    assert.equal(await run(transcript, true), 1);
    saved = savedState(transcript);
    assert.equal(saved.offset, fs.statSync(transcript).size);
    assert.equal(saved.turnCount, 1);
  });

  it("export success advances state", async () => {
    const transcript = setup();
    assert.equal(await run(transcript, true), 1);
    let saved = savedState(transcript);
    assert.equal(saved.offset, fs.statSync(transcript).size);
    assert.equal(saved.turnCount, 1);

    // Re-running with no new content emits nothing and keeps state stable.
    assert.equal(await run(transcript, true), 0);
    assert.equal(savedState(transcript).turnCount, 1);
  });
});

describe("incomplete trailing turn (flush race)", () => {
  let dir: string | null = null;
  afterEach(() => {
    process.env.CC_LMNR_STATE_DIR = BASELINE_STATE_DIR;
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
      dir = null;
    }
  });

  it("holds a user-only turn on Stop and emits it once the assistant lands", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "lmnr-race-"));
    process.env.CC_LMNR_STATE_DIR = dir;
    const transcript = path.join(dir, "session.jsonl");
    const key = getSessionStateKey("sess", transcript);
    const saved = () => getSessionState(loadHookState(), key);
    const runHook = (event: "Stop" | "SessionEnd") => {
      const emitter = makeEmitter();
      return emitNewTurnsFromTranscript(emitter, emitter.config, "sess", transcript, {
        flushDeferredAgentTurns: event === "SessionEnd",
        exportFn: async () => true,
      });
    };

    // Stop fires with only the user prompt written (assistant not flushed yet).
    fs.writeFileSync(transcript, JSON.stringify(userRow("hi")) + "\n");
    assert.equal(await runHook("Stop"), 0);
    assert.equal(saved().turnCount, 0);
    assert.equal(saved().pendingTurnRows.length, 1); // held, not dropped

    // Assistant row lands; SessionEnd flushes the now-complete turn.
    fs.appendFileSync(transcript, JSON.stringify(assistantRow([{ type: "text", text: "yo" }])) + "\n");
    assert.equal(await runHook("SessionEnd"), 1);
    assert.equal(saved().turnCount, 1);
    assert.equal(saved().pendingTurnRows.length, 0);
  });
});

describe("emitTurn", () => {
  const emit = (rows: any[], subagents: Record<string, SubagentTranscript> | null = null): TraceEmitter => {
    const emitter = makeEmitter();
    const turns = buildTurns(rows);
    assert.equal(turns.length, 1);
    emitTurn(emitter, emitter.config, "0123abcd-0000-4000-8000-000000000000", 1, turns[0]!, "/tmp/session.jsonl", subagents);
    return emitter;
  };

  it("simple turn spans", () => {
    const emitter = emit([userRow("hello"), assistantRow([{ type: "text", text: "hi" }])]);
    const names = spansByName(emitter.spans);
    assert.ok("Claude Code - Turn 1 (0123abcd)" in names);
    assert.ok("LLM Call 1" in names);

    const root = names["Claude Code - Turn 1 (0123abcd)"]!;
    const rootAttrs = attrs(root);
    assert.equal(root.parentSpanId, undefined);
    assert.equal(rootAttrs["lmnr.span.type"], "DEFAULT");
    assert.equal(rootAttrs["lmnr.association.properties.session_id"], "0123abcd-0000-4000-8000-000000000000");
    assert.deepEqual(JSON.parse(rootAttrs["lmnr.span.input"]), { role: "user", content: "hello" });
    assert.deepEqual(JSON.parse(rootAttrs["lmnr.span.output"]), { role: "assistant", content: "hi" });

    const llm = names["LLM Call 1"]!;
    const llmAttrs = attrs(llm);
    assert.equal(llm.parentSpanId, root.spanContext().spanId);
    assert.equal(llm.spanContext().traceId, root.spanContext().traceId);
    assert.equal(llmAttrs["lmnr.span.type"], "LLM");
    assert.equal(llmAttrs["gen_ai.request.model"], "claude-opus-4-7");
    assert.equal(llmAttrs["gen_ai.usage.input_tokens"], 10);
    assert.equal(llmAttrs["gen_ai.usage.output_tokens"], 5);
    assert.deepEqual(JSON.parse(llmAttrs["gen_ai.input.messages"]), [{ role: "user", content: "hello" }]);
    const outMsgs = JSON.parse(llmAttrs["gen_ai.output.messages"]);
    assert.equal(outMsgs[0].role, "assistant");
    assert.equal(outMsgs[0].content, "hi");
  });

  it("tool turn spans", () => {
    const emitter = emit([
      userRow("run ls"),
      assistantRow([{ type: "tool_use", id: "tu_1", name: "Bash", input: { command: "ls" } }]),
      toolResultRow("tu_1", "file.txt"),
      assistantRow([{ type: "text", text: "done" }], { msgId: "m2", ts: "2026-07-08T10:00:15.000Z" }),
    ]);
    const names = spansByName(emitter.spans);
    assert.deepEqual(new Set(Object.keys(names)), new Set(["Claude Code - Turn 1 (0123abcd)", "LLM Call 1", "Bash", "LLM Call 2"]));

    const toolAttrs = attrs(names["Bash"]!);
    assert.equal(toolAttrs["lmnr.span.type"], "TOOL");
    assert.deepEqual(JSON.parse(toolAttrs["lmnr.span.input"]), { command: "ls" });
    assert.deepEqual(JSON.parse(toolAttrs["lmnr.span.output"]), "file.txt");

    const llm2Attrs = attrs(names["LLM Call 2"]!);
    const inMsgs = JSON.parse(llm2Attrs["gen_ai.input.messages"]);
    assert.equal(inMsgs[0].role, "tool");
    assert.equal(inMsgs[0].tool_call_id, "tu_1");

    const llm1Attrs = attrs(names["LLM Call 1"]!);
    const outMsgs = JSON.parse(llm1Attrs["gen_ai.output.messages"]);
    assert.equal(outMsgs[0].tool_calls[0].name, "Bash");
  });

  it("timestamps backdated and ordered", () => {
    const emitter = emit([
      userRow("hello", "2026-07-08T10:00:00.000Z"),
      assistantRow([{ type: "text", text: "hi" }], { ts: "2026-07-08T10:00:05.000Z" }),
    ]);
    const names = spansByName(emitter.spans);
    const root = names["Claude Code - Turn 1 (0123abcd)"]!;
    const llm = names["LLM Call 1"]!;
    const expectedStartNs = BigInt(Date.UTC(2026, 6, 8, 10, 0, 0)) * 1_000_000n;
    assert.equal(hrToNs(root.startTime), expectedStartNs);
    assert.ok(hrToNs(root.endTime) >= hrToNs(root.startTime));
    assert.ok(hrToNs(llm.startTime) >= hrToNs(root.startTime));
    assert.ok(hrToNs(llm.endTime) <= hrToNs(root.endTime));
  });

  it("skill tags", () => {
    const emitter = emit([
      userRow("use a skill"),
      assistantRow([{ type: "tool_use", id: "tu_s", name: "Skill", input: { skill: "coding" } }]),
      toolResultRow("tu_s", "ok"),
      assistantRow([{ type: "text", text: "done" }], { msgId: "m2" }),
    ]);
    const root = spansByName(emitter.spans)["Claude Code - Turn 1 (0123abcd)"]!;
    const tags = attrs(root)["lmnr.association.properties.tags"] as string[];
    assert.ok(tags.includes("claude-code"));
    assert.ok(tags.includes("skill:coding"));
  });

  it("subagent nested under tool span", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lmnr-sub-"));
    try {
      const subJsonl = path.join(dir, "agent-abc.jsonl");
      const subRows = [
        userRow("subagent prompt", "2026-07-08T10:00:06.000Z"),
        assistantRow([{ type: "text", text: "subagent answer" }], { msgId: "sm1", ts: "2026-07-08T10:00:08.000Z" }),
      ];
      fs.writeFileSync(subJsonl, subRows.map((r) => JSON.stringify(r)).join("\n") + "\n");

      const subagents: Record<string, SubagentTranscript> = {
        tu_task: { path: subJsonl, agentId: "abc", agentType: "Explore", description: "find stuff" },
      };
      const emitter = emit(
        [
          userRow("delegate"),
          assistantRow([{ type: "tool_use", id: "tu_task", name: "Task", input: { prompt: "go" } }]),
          toolResultRow("tu_task", "task done", "2026-07-08T10:00:09.000Z"),
          assistantRow([{ type: "text", text: "summary" }], { msgId: "m2", ts: "2026-07-08T10:00:10.000Z" }),
        ],
        subagents
      );
      const names = spansByName(emitter.spans);
      assert.ok("Subagent: find stuff" in names);
      assert.ok("Subagent LLM Call 1" in names);

      const toolSpan = names["Task"]!;
      const subSpan = names["Subagent: find stuff"]!;
      const subLlm = names["Subagent LLM Call 1"]!;
      assert.equal(subSpan.parentSpanId, toolSpan.spanContext().spanId);
      assert.equal(subLlm.parentSpanId, subSpan.spanContext().spanId);
      assert.equal(attrs(subSpan)["claude_code.subagent.type"], "Explore");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("user_id attached when configured", () => {
    const emitter = makeEmitter("user-42");
    const turns = buildTurns([userRow("hello"), assistantRow([{ type: "text", text: "hi" }])]);
    emitTurn(emitter, emitter.config, "sess", 1, turns[0]!, "/tmp/t.jsonl");
    const root = emitter.spans.find((s) => s.parentSpanId === undefined)!;
    assert.equal(attrs(root)["lmnr.association.properties.user_id"], "user-42");
  });
});
