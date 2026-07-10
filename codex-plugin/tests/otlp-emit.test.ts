import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";

// Keep the plugin's log/state out of the real ~/.codex during tests.
const BASELINE_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "lmnr-codex-testlog-"));
process.env.CODEX_LMNR_STATE_DIR = BASELINE_STATE_DIR;

import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { JsonTraceSerializer } from "@opentelemetry/otlp-transformer";

import type { LaminarConfig } from "../src/config.js";
import { emitNewTurnsFromRollout, emitTurn, parseMcpToolName } from "../src/emit.js";
import { getSessionState, getSessionStateKey, loadHookState, SessionState } from "../src/state.js";
import { TraceEmitter } from "../src/tracer.js";
import { buildTurns } from "../src/turns.js";
import {
  assistantMessageLine,
  functionCallLine,
  functionCallOutputLine,
  reasoningLine,
  sessionMetaLine,
  spansByName,
  taskCompleteLine,
  tokenCountLine,
  turnContextLine,
  userMessageLine,
} from "./helpers.js";

function makeEmitter(userId: string | null = null): TraceEmitter {
  const config: LaminarConfig = { apiKey: "k", baseUrl: "http://localhost:1", userId };
  return new TraceEmitter(config);
}

function attrs(span: ReadableSpan): Record<string, any> {
  return span.attributes;
}

const SESSION_ID = "5973b6c0-94b8-487b-a530-2aeb6098ae0e";

function emitSimpleTurn(emitter: TraceEmitter, rows: any[], state = new SessionState()): void {
  const { turns } = buildTurns(rows);
  assert.equal(turns.length, 1);
  emitTurn(emitter, emitter.config, SESSION_ID, 1, turns[0]!, "/tmp/rollout-x.jsonl", state);
}

describe("emitTurn span structure", () => {
  it("root + LLM + tool spans with Laminar attributes", () => {
    const emitter = makeEmitter("user-1");
    const state = new SessionState({ meta: { threadId: SESSION_ID, cwd: "/home/dev/project", branch: "main", cliVersion: "0.144.0" } });
    emitSimpleTurn(
      emitter,
      [
        turnContextLine("gpt-5.2-codex"),
        userMessageLine("list files"),
        reasoningLine("thinking"),
        functionCallLine("shell", { command: ["ls"] }, "call_1"),
        functionCallOutputLine("call_1", "file1\nfile2"),
        assistantMessageLine("two files"),
        tokenCountLine({ input_tokens: 100, cached_input_tokens: 40, output_tokens: 20 }),
        taskCompleteLine(),
      ],
      state
    );

    const byName = spansByName(emitter.spans);
    const root = byName[`Codex - Turn 1 (5973b6c0)`]!;
    assert.ok(root);
    assert.equal(attrs(root)["lmnr.span.type"], "DEFAULT");
    assert.equal(attrs(root)["lmnr.association.properties.session_id"], SESSION_ID);
    assert.deepEqual(attrs(root)["lmnr.association.properties.tags"], ["codex"]);
    assert.equal(attrs(root)["lmnr.association.properties.metadata.source"], "codex");
    assert.equal(attrs(root)["lmnr.association.properties.metadata.cwd"], "/home/dev/project");
    assert.equal(attrs(root)["lmnr.association.properties.metadata.git_branch"], "main");
    assert.equal(attrs(root)["lmnr.association.properties.user_id"], "user-1");
    assert.deepEqual(JSON.parse(attrs(root)["lmnr.span.input"]), { role: "user", content: "list files" });
    assert.deepEqual(JSON.parse(attrs(root)["lmnr.span.output"]), { role: "assistant", content: "two files" });

    const llm1 = byName["LLM Call 1"]!;
    assert.equal(attrs(llm1)["lmnr.span.type"], "LLM");
    assert.equal(attrs(llm1)["gen_ai.system"], "openai");
    assert.equal(attrs(llm1)["gen_ai.request.model"], "gpt-5.2-codex");
    const input1 = JSON.parse(attrs(llm1)["gen_ai.input.messages"]);
    assert.deepEqual(input1, [{ role: "user", content: "list files" }]);
    const output1 = JSON.parse(attrs(llm1)["gen_ai.output.messages"]);
    assert.equal(output1[0].role, "assistant");
    const thinkingPart = output1[0].parts.find((p: any) => p.type === "thinking");
    assert.equal(thinkingPart.content, "thinking");
    const toolCallPart = output1[0].parts.find((p: any) => p.type === "tool_call");
    assert.equal(toolCallPart.name, "shell");
    assert.equal(toolCallPart.id, "call_1");
    assert.deepEqual(toolCallPart.arguments, { command: ["ls"] });

    const llm2 = byName["LLM Call 2"]!;
    const input2 = JSON.parse(attrs(llm2)["gen_ai.input.messages"]);
    assert.equal(input2[0].role, "tool");
    assert.equal(input2[0].tool_call_id, "call_1");
    // Usage lands on the step that carried token_count (the last one).
    assert.equal(attrs(llm2)["gen_ai.usage.input_tokens"], 100);
    assert.equal(attrs(llm2)["gen_ai.usage.cache_read_input_tokens"], 40);
    assert.equal(attrs(llm2)["gen_ai.usage.output_tokens"], 20);
    assert.equal(attrs(llm2)["llm.usage.total_tokens"], 120);

    const tool = byName["shell"]!;
    assert.equal(attrs(tool)["lmnr.span.type"], "TOOL");
    assert.equal(attrs(tool)["codex.tool.name"], "shell");
    assert.equal(attrs(tool)["codex.tool.call_id"], "call_1");
    assert.deepEqual(JSON.parse(attrs(tool)["lmnr.span.input"]), { command: ["ls"] });
    assert.equal(attrs(tool)["lmnr.span.output"], "file1\nfile2");

    // Tool span is a child of the root span, LLM spans too.
    assert.equal(tool.parentSpanId, root.spanContext().spanId);
    assert.equal(llm1.parentSpanId, root.spanContext().spanId);
    // All spans share the root's trace.
    for (const s of emitter.spans) {
      assert.equal(s.spanContext().traceId, root.spanContext().traceId);
    }
  });

  it("MCP tool names get server/tool attributes", () => {
    const emitter = makeEmitter();
    emitSimpleTurn(emitter, [
      turnContextLine(),
      userMessageLine("remember this"),
      functionCallLine("mcp__memory__create_entities", { items: [] }, "call_m"),
      functionCallOutputLine("call_m", "ok"),
      assistantMessageLine("saved"),
      taskCompleteLine(),
    ]);
    const tool = spansByName(emitter.spans)["mcp__memory__create_entities"]!;
    assert.equal(attrs(tool)["codex.tool.mcp_server"], "memory");
    assert.equal(attrs(tool)["codex.tool.mcp_tool"], "create_entities");
  });

  it("wire format: valid hex ids and OTLP JSON envelope", () => {
    const emitter = makeEmitter();
    emitSimpleTurn(emitter, [turnContextLine(), userMessageLine("hi"), assistantMessageLine("hello"), taskCompleteLine()]);

    const span = emitter.spans[0]!;
    assert.match(span.spanContext().traceId, /^[0-9a-f]{32}$/);
    assert.match(span.spanContext().spanId, /^[0-9a-f]{16}$/);

    const bytes = JsonTraceSerializer.serializeRequest(emitter.spans);
    const payload = JSON.parse(Buffer.from(bytes!).toString("utf-8"));
    const wireSpans = payload.resourceSpans[0].scopeSpans[0].spans;
    const root = wireSpans.find((s: any) => s.name.startsWith("Codex - Turn 1"));
    assert.ok(root);
    assert.equal(typeof root.startTimeUnixNano, "string");
    const wireAttr = (span: any, key: string) => span.attributes.find((a: any) => a.key === key)?.value;
    assert.deepEqual(wireAttr(root, "lmnr.span.type"), { stringValue: "DEFAULT" });
    const tags = wireAttr(root, "lmnr.association.properties.tags");
    assert.ok(tags.arrayValue.values.some((v: any) => v.stringValue === "codex"));
  });

  it("spans are backdated to rollout timestamps", () => {
    const emitter = makeEmitter();
    const t0 = "2026-07-09T09:00:00.000Z";
    const t1 = "2026-07-09T09:00:05.000Z";
    const t2 = "2026-07-09T09:00:09.000Z";
    emitSimpleTurn(emitter, [
      turnContextLine("m", t0),
      userMessageLine("hi", t0),
      assistantMessageLine("hello", t1),
      taskCompleteLine(null, t2),
    ]);
    const root = spansByName(emitter.spans)[`Codex - Turn 1 (5973b6c0)`]!;
    const startMs = root.startTime[0] * 1000 + root.startTime[1] / 1e6;
    const endMs = root.endTime[0] * 1000 + root.endTime[1] / 1e6;
    assert.equal(startMs, Date.parse(t0));
    assert.equal(endMs, Date.parse(t2));
  });
});

describe("parseMcpToolName", () => {
  it("parses server and tool", () => {
    assert.deepEqual(parseMcpToolName("mcp__filesystem__write_file"), { server: "filesystem", tool: "write_file" });
    assert.equal(parseMcpToolName("shell"), null);
    assert.equal(parseMcpToolName("mcp__x"), null);
  });
});

describe("emitNewTurnsFromRollout state handling", () => {
  const writeRollout = (rows: any[]): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lmnr-codex-e2e-"));
    const file = path.join(dir, `rollout-2026-07-09T10-00-00-${SESSION_ID}.jsonl`);
    fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf-8");
    return file;
  };

  const config: LaminarConfig = { apiKey: "k", baseUrl: "http://localhost:1", userId: null };

  it("advances state after successful export and retries on failure", async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "lmnr-codex-state-"));
    process.env.CODEX_LMNR_STATE_DIR = stateDir;
    try {
      const file = writeRollout([
        sessionMetaLine(),
        turnContextLine(),
        userMessageLine("q1"),
        assistantMessageLine("a1"),
        taskCompleteLine(),
      ]);

      // Failed export: nothing persisted, turn retried.
      let emitter = new TraceEmitter(config);
      let n = await emitNewTurnsFromRollout(emitter, config, SESSION_ID, file, { exportFn: async () => false });
      assert.equal(n, 0);
      let sessionState = getSessionState(loadHookState(), getSessionStateKey(SESSION_ID, file));
      assert.equal(sessionState.turnCount, 0);
      assert.equal(sessionState.offset, 0);

      // Successful export: offset + turnCount advance.
      emitter = new TraceEmitter(config);
      n = await emitNewTurnsFromRollout(emitter, config, SESSION_ID, file, { exportFn: async () => true });
      assert.equal(n, 1);
      sessionState = getSessionState(loadHookState(), getSessionStateKey(SESSION_ID, file));
      assert.equal(sessionState.turnCount, 1);
      assert.ok(sessionState.offset > 0);

      // Second run with no new rows emits nothing.
      emitter = new TraceEmitter(config);
      n = await emitNewTurnsFromRollout(emitter, config, SESSION_ID, file, { exportFn: async () => true });
      assert.equal(n, 0);
    } finally {
      process.env.CODEX_LMNR_STATE_DIR = BASELINE_STATE_DIR;
    }
  });

  it("turn numbering continues across runs", async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "lmnr-codex-state2-"));
    process.env.CODEX_LMNR_STATE_DIR = stateDir;
    try {
      const file = writeRollout([
        sessionMetaLine(),
        turnContextLine(),
        userMessageLine("q1"),
        assistantMessageLine("a1"),
        taskCompleteLine(),
      ]);
      let emitter = new TraceEmitter(config);
      await emitNewTurnsFromRollout(emitter, config, SESSION_ID, file, { exportFn: async () => true });

      fs.appendFileSync(
        file,
        [userMessageLine("q2"), assistantMessageLine("a2"), taskCompleteLine()].map((r) => JSON.stringify(r)).join("\n") + "\n"
      );
      emitter = new TraceEmitter(config);
      const n = await emitNewTurnsFromRollout(emitter, config, SESSION_ID, file, { exportFn: async () => true });
      assert.equal(n, 1);
      const names = emitter.spans.map((s) => s.name);
      assert.ok(names.includes(`Codex - Turn 2 (5973b6c0)`));
    } finally {
      process.env.CODEX_LMNR_STATE_DIR = BASELINE_STATE_DIR;
    }
  });
});
