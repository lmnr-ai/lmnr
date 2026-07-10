import type { LaminarConfig } from "./config.js";
import { debug, info } from "./logger.js";
import {
  getLineType,
  getPayload,
  parseTimestamp,
  readNewJsonl,
  truncateText,
} from "./rollout.js";
import {
  getSessionState,
  getSessionStateKey,
  loadHookState,
  saveSessionState,
  withStateLock,
  type SessionState,
} from "./state.js";
import { ASSOC_PREFIX, SPAN_OUTPUT_ATTR, exportWithTimeout, startSpan, TraceEmitter, type SpanHandle } from "./tracer.js";
import { buildTurns, type Step, type ToolCall, type Turn } from "./turns.js";
import type { Json, Row } from "./types.js";
import { getLatestTimestamp, jsonDumps } from "./util.js";

// ----------------- Trace naming and tags -----------------
/** Return a compact session label for trace names. */
export function shortSessionLabel(sessionId: string, maxLen = 12): string {
  const sid = sessionId.trim();
  if (!sid) {
    return "unknown";
  }
  const parts = sid.split("-");
  if (parts.length === 5 && parts[0]!.length === 8) {
    return parts[0]!;
  }
  return sid.length <= maxLen ? sid : sid.slice(0, maxLen).replace(/-+$/, "");
}

function traceDisplayName(sessionId: string, turnNum: number): string {
  return `Codex - Turn ${turnNum} (${shortSessionLabel(sessionId)})`;
}

// ----------------- MCP tool name parsing -----------------
/**
 * Codex exposes MCP tools to the model as mcp__<server>__<tool>. Segments may
 * carry hash suffixes / truncation, so this is best-effort display metadata.
 */
export function parseMcpToolName(name: string): { server: string; tool: string } | null {
  if (!name.startsWith("mcp__")) {
    return null;
  }
  const rest = name.slice(5);
  const sep = rest.indexOf("__");
  if (sep <= 0) {
    return null;
  }
  return { server: rest.slice(0, sep), tool: rest.slice(sep + 2) };
}

// ----------------- Generation payloads -----------------
function toolOutputString(output: Json): string {
  if (typeof output === "string") {
    return output;
  }
  return jsonDumps(output ?? null);
}

function buildGenerationInputMessages(stepIndex: number, userText: string, previousStep: Step | null): Row[] {
  if (stepIndex === 0 || previousStep === null) {
    return [{ role: "user", content: userText }];
  }
  const withOutput = previousStep.toolCalls.filter((c) => c.output !== undefined);
  if (withOutput.length > 0) {
    // tool_call_id / name are the OpenAI-style wire field names (kept verbatim).
    return withOutput.map((call) => ({
      role: "tool",
      content: truncateText(toolOutputString(call.output))[0],
      tool_call_id: call.callId,
      name: call.name,
    }));
  }
  return [{ role: "user", content: userText }];
}

function buildGenerationOutputMessage(step: Step): Row {
  const [assistantText] = truncateText(step.assistantText);
  const output: Row = { role: "assistant", content: assistantText };
  if (step.toolCalls.length > 0) {
    output.tool_calls = step.toolCalls.map((call) => ({
      id: call.callId,
      name: call.name,
      arguments: typeof call.input === "object" && call.input !== null && !Array.isArray(call.input) ? call.input : {},
    }));
  }
  return output;
}

function buildGenerationAttributes(
  stepIndex: number,
  step: Step,
  userText: string,
  previousStep: Step | null,
  model: string | null
): Record<string, Json> {
  const attrs: Record<string, Json> = {
    "gen_ai.system": "openai",
    "gen_ai.request.model": model ?? "codex",
    "gen_ai.response.model": model ?? "codex",
  };

  attrs["gen_ai.input.messages"] = jsonDumps(buildGenerationInputMessages(stepIndex, userText, previousStep));
  attrs["gen_ai.output.messages"] = jsonDumps([buildGenerationOutputMessage(step)]);

  if (step.usage !== null) {
    let total = 0;
    for (const [key, value] of Object.entries(step.usage)) {
      attrs[`gen_ai.usage.${key}`] = value;
      // Codex's input_tokens already includes cached tokens, so total is
      // input + output (+ reasoning, which is part of output for OpenAI).
      if (key === "input_tokens" || key === "output_tokens") {
        total += value;
      }
    }
    if (total > 0) {
      attrs["llm.usage.total_tokens"] = total;
    }
  }

  return attrs;
}

// ----------------- Tool spans -----------------
function buildToolAttributes(call: ToolCall): Record<string, Json> {
  // Plain span attributes, NOT lmnr.association.properties.metadata.* —
  // association metadata propagates to the whole trace.
  const attrs: Record<string, Json> = {
    "codex.tool.name": call.name,
    "codex.tool.call_id": call.callId,
  };
  const mcp = parseMcpToolName(call.name);
  if (mcp !== null) {
    attrs["codex.tool.mcp_server"] = mcp.server;
    attrs["codex.tool.mcp_tool"] = mcp.tool;
  }
  return attrs;
}

function getToolInputForObservation(call: ToolCall): Json {
  const raw = call.input;
  if (typeof raw === "string") {
    return truncateText(raw)[0];
  }
  if (typeof raw === "object" || typeof raw === "number" || typeof raw === "boolean") {
    return raw ?? {};
  }
  return {};
}

function emitToolSpan(emitter: TraceEmitter, parentSpan: SpanHandle, call: ToolCall, fallbackStart: Date | null): Date | null {
  const startTs = parseTimestamp(call.timestamp) ?? fallbackStart;
  const endTs = parseTimestamp(call.outputTimestamp) ?? startTs;

  const toolSpan = startSpan(emitter, {
    name: call.name,
    parent: parentSpan,
    startTime: startTs,
    spanType: "TOOL",
    inputValue: getToolInputForObservation(call),
    attributes: buildToolAttributes(call),
  });
  if (call.output !== undefined && call.output !== null) {
    toolSpan.setAttributes({ [SPAN_OUTPUT_ATTR]: truncateText(toolOutputString(call.output))[0] });
  }
  toolSpan.end(endTs);
  return endTs;
}

// ----------------- Turn spans -----------------
function buildTraceRootAttributes(
  config: LaminarConfig,
  sessionId: string,
  turnNum: number,
  sessionState: SessionState,
  transcriptPath: string,
  turn: Turn
): Record<string, Json> {
  const attrs: Record<string, Json> = {
    [`${ASSOC_PREFIX}.session_id`]: sessionId,
    [`${ASSOC_PREFIX}.tags`]: ["codex"],
    [`${ASSOC_PREFIX}.metadata.source`]: "codex",
    [`${ASSOC_PREFIX}.metadata.turn_number`]: String(turnNum),
    [`${ASSOC_PREFIX}.metadata.transcript`]: transcriptPath.split(/[/\\]/).pop() ?? "",
  };
  if (config.userId) {
    attrs[`${ASSOC_PREFIX}.user_id`] = config.userId;
  }
  if (turn.aborted) {
    attrs[`${ASSOC_PREFIX}.metadata.aborted`] = "true";
  }
  const meta = sessionState.meta;
  if (meta.cwd) {
    attrs[`${ASSOC_PREFIX}.metadata.cwd`] = meta.cwd;
  }
  if (meta.branch) {
    attrs[`${ASSOC_PREFIX}.metadata.git_branch`] = meta.branch;
  }
  if (meta.cliVersion) {
    attrs[`${ASSOC_PREFIX}.metadata.cli_version`] = meta.cliVersion;
  }
  return attrs;
}

export function emitTurn(
  emitter: TraceEmitter,
  config: LaminarConfig,
  sessionId: string,
  turnNum: number,
  turn: Turn,
  transcriptPath: string,
  sessionState: SessionState
): void {
  const [userText] = truncateText(turn.userText);
  const [finalAssistantText] = truncateText(turn.lastAssistantText);

  const userTs = parseTimestamp(turn.userTimestamp);
  const turnEndTs = parseTimestamp(turn.endTimestamp);

  const rootSpan = startSpan(emitter, {
    name: traceDisplayName(sessionId, turnNum),
    parent: null,
    startTime: userTs,
    spanType: "DEFAULT",
    inputValue: { role: "user", content: userText },
    attributes: buildTraceRootAttributes(config, sessionId, turnNum, sessionState, transcriptPath, turn),
  });

  let latestEnd: Date | null = userTs;
  let previousStep: Step | null = null;
  let previousStepEnd: Date | null = userTs;

  turn.steps.forEach((step, stepIndex) => {
    const stepModelTs = parseTimestamp(step.lastModelTimestamp) ?? parseTimestamp(step.timestamp);
    const genStart = previousStepEnd ?? parseTimestamp(step.timestamp);
    const genSpan = startSpan(emitter, {
      name: `LLM Call ${stepIndex + 1}`,
      parent: rootSpan,
      startTime: genStart,
      spanType: "LLM",
      attributes: buildGenerationAttributes(stepIndex, step, userText, previousStep, turn.model),
    });
    const genEnd = stepModelTs ?? genStart;
    genSpan.end(genEnd);
    latestEnd = getLatestTimestamp(latestEnd, genEnd);

    let latestToolEnd: Date | null = null;
    for (const call of step.toolCalls) {
      const toolEnd = emitToolSpan(emitter, rootSpan, call, genEnd);
      latestToolEnd = getLatestTimestamp(latestToolEnd, toolEnd);
    }
    latestEnd = getLatestTimestamp(latestEnd, latestToolEnd);

    previousStep = step;
    previousStepEnd = latestToolEnd ?? genEnd;
  });

  rootSpan.setAttributes({ [SPAN_OUTPUT_ATTR]: jsonDumps({ role: "assistant", content: finalAssistantText }) });
  rootSpan.end(getLatestTimestamp(turnEndTs, latestEnd, userTs));
}

// ----------------- New turn emission orchestration -----------------
export function emitReadyTurns(
  emitter: TraceEmitter,
  config: LaminarConfig,
  sessionId: string,
  transcriptPath: string,
  turnsToEmit: Turn[],
  sessionState: SessionState,
  emitTurnFn: typeof emitTurn = emitTurn
): number {
  let emitted = 0;
  for (const turn of turnsToEmit) {
    const turnNum = sessionState.turnCount + emitted + 1;
    try {
      emitTurnFn(emitter, config, sessionId, turnNum, turn, transcriptPath, sessionState);
    } catch (e) {
      // Log at INFO so emit failures are visible without CODEX_LMNR_DEBUG=true.
      // The failed turn is not counted, so turnCount only reflects turns whose
      // spans were actually built.
      info(`emitTurn failed: ${e}`);
      continue;
    }
    emitted += 1;
  }
  return emitted;
}

/** Capture session metadata from the FIRST session_meta line (fork-copied history may carry more). */
function captureSessionMeta(rows: Row[], sessionState: SessionState): void {
  if (sessionState.meta.threadId) {
    return;
  }
  for (const row of rows) {
    if (getLineType(row) !== "session_meta") {
      continue;
    }
    const payload = getPayload(row);
    const git = payload.git;
    sessionState.meta = {
      threadId: typeof payload.id === "string" ? payload.id : undefined,
      cwd: typeof payload.cwd === "string" ? payload.cwd : undefined,
      branch: typeof git === "object" && git !== null && typeof git.branch === "string" ? git.branch : undefined,
      cliVersion: typeof payload.cli_version === "string" ? payload.cli_version : undefined,
      originator: typeof payload.originator === "string" ? payload.originator : undefined,
      parentThreadId: typeof payload.parent_thread_id === "string" ? payload.parent_thread_id : undefined,
    };
    return;
  }
}

export function getNewTurnsFromRollout(
  transcriptPath: string,
  sessionState: SessionState,
  flushIncompleteTurns = false
): [Turn[], SessionState] {
  let rows: Row[];
  [rows, sessionState] = readNewJsonl(transcriptPath, sessionState);
  // Replay an incomplete trailing turn held from a prior run (chronologically
  // oldest), then let it flow through the normal pipeline.
  if (sessionState.pendingTurnRows.length > 0) {
    rows = [...sessionState.pendingTurnRows, ...rows];
    sessionState.pendingTurnRows = [];
  }
  captureSessionMeta(rows, sessionState);

  const { turns, lastModel } = buildTurns(rows, sessionState.lastModel);
  sessionState.lastModel = lastModel;

  // Hold back trailing turns that have not seen task_complete / turn_aborted
  // yet — the Stop hook can fire while output rows are still being appended.
  // A held turn's raw rows are replayed on the next run.
  if (!flushIncompleteTurns) {
    let firstIncomplete = turns.length;
    while (firstIncomplete > 0 && !turns[firstIncomplete - 1]!.completed) {
      firstIncomplete -= 1;
    }
    const held = turns.slice(firstIncomplete);
    if (held.length > 0) {
      sessionState.pendingTurnRows = held.flatMap((t) => t.rows);
      return [turns.slice(0, firstIncomplete), sessionState];
    }
  }
  return [turns, sessionState];
}

export interface EmitNewTurnsOptions {
  flushIncompleteTurns?: boolean;
  exportFn?: (emitter: TraceEmitter) => Promise<boolean>;
}

export async function emitNewTurnsFromRollout(
  emitter: TraceEmitter,
  config: LaminarConfig,
  sessionId: string,
  transcriptPath: string,
  opts: EmitNewTurnsOptions = {}
): Promise<number> {
  const flushIncompleteTurns = opts.flushIncompleteTurns ?? false;
  const exportFn = opts.exportFn ?? exportWithTimeout;

  return withStateLock(async () => {
    const state = loadHookState();
    const key = getSessionStateKey(sessionId, transcriptPath);
    let sessionState = getSessionState(state, key);

    let turns: Turn[];
    [turns, sessionState] = getNewTurnsFromRollout(transcriptPath, sessionState, flushIncompleteTurns);
    // Skip turns with no model output at all (e.g. aborted before any response).
    turns = turns.filter((t) => t.steps.length > 0 || t.lastAssistantText);
    if (turns.length === 0) {
      saveSessionState(state, key, sessionState);
      return 0;
    }

    const emitted = emitReadyTurns(emitter, config, sessionId, transcriptPath, turns, sessionState);
    debug(`Built spans for ${emitted}/${turns.length} turn(s)`);

    // Only persist the advanced offset after a successful export; on failure
    // the old state stays on disk so the next hook run re-reads the same bytes
    // and retries.
    const exported = await exportFn(emitter);
    if (!exported) {
      info("OTLP export failed; keeping previous state so these turns are retried on the next hook run");
      return 0;
    }

    sessionState.turnCount += emitted;
    saveSessionState(state, key, sessionState);
    return emitted;
  });
}
