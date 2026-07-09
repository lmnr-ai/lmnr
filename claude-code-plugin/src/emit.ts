import { CAPTURE_SKILL_CONTENT, SKILL_TAGS, type LaminarConfig } from "./config.js";
import { getTurnsToEmit, popAllDeferredAgentTurnRowLists, resolveDeferredAgentTurns } from "./deferral.js";
import { debug, info } from "./logger.js";
import { getSessionState, getSessionStateKey, loadHookState, saveSessionState, withStateLock, type SessionState } from "./state.js";
import { isTaskNotificationRow } from "./notifications.js";
import {
  extractTextFromContent,
  getContentFromRow,
  getModel,
  getToolUseBlocks,
  getUsageDetailsFromRow,
  getUserOrAssistantRoleFromRow,
  isToolResult,
  parseTimestamp,
  readNewJsonl,
  truncateText,
} from "./transcript.js";
import { ASSOC_PREFIX, SPAN_OUTPUT_ATTR, startSpan, TraceEmitter, exportWithTimeout, type SpanHandle } from "./tracer.js";
import { buildTurns, type Turn } from "./turns.js";
import { getSubagentTranscriptsByToolUseId, getTaskIdToToolUseId, readSubagentJsonl, type SubagentTranscript } from "./subagents.js";
import type { Json, Row } from "./types.js";
import { getLatestTimestamp, jsonDumps } from "./util.js";

// ----------------- Emission internal shapes -----------------
interface GenerationToolResult {
  tool_use_id: string;
  tool_name: string;
  output: Json;
}

interface PendingSubagent {
  tool_use_id: string;
  subagent: SubagentTranscript;
  parent_span: SpanHandle;
  start_timestamp: Date | null;
  ready_timestamp: Date | null;
  display_start_timestamp?: Date | null;
}

interface PendingAsyncToolResult {
  timestamp: Date | null;
  tool_result: GenerationToolResult;
}

interface ToolResultForObservation {
  output: Json;
  result_timestamp: Date | null;
  final_output: Json;
  final_result_timestamp: Date | null;
}

interface EmittedSingleToolObservation {
  handoff_timestamp: Date | null;
  tool_result: GenerationToolResult;
  latest_end_timestamp: Date | null;
}

interface EmittedToolObservationBatch {
  result_timestamps: Date[];
  tool_results: GenerationToolResult[];
  latest_end_timestamp: Date | null;
}

// ----------------- Trace naming and tags -----------------
/** Return 'skill:<name>' tags for every Skill tool invocation in the turn. */
function collectSkillTags(turn: Turn): string[] {
  const names: string[] = [];
  for (const assistantMessage of turn.assistantMsgs) {
    for (const toolUse of getToolUseBlocks(getContentFromRow(assistantMessage))) {
      if (toolUse.name !== "Skill") {
        continue;
      }
      const toolInput = toolUse.input;
      const skill = typeof toolInput === "object" && toolInput !== null ? toolInput.skill : null;
      if (typeof skill === "string" && skill && !names.includes(`skill:${skill}`)) {
        names.push(`skill:${skill}`);
      }
    }
  }
  return names;
}

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
  return `Claude Code - Turn ${turnNum} (${shortSessionLabel(sessionId)})`;
}

function getTraceTags(turn: Turn): string[] {
  const tags = ["claude-code"];
  if (SKILL_TAGS) {
    tags.push(...collectSkillTags(turn));
  }
  return tags;
}

// ----------------- Generation payloads -----------------
function buildGenerationInputMessages(
  assistantIndex: number,
  userText: string,
  previousToolResults: GenerationToolResult[],
  readyAsyncToolResults: PendingAsyncToolResult[]
): Row[] | null {
  if (assistantIndex === 0) {
    return [{ role: "user", content: userText }];
  }
  // Both feed the next generation's context: results from the previous tool
  // batch AND async agent results that became ready since.
  const toolResults = [...previousToolResults, ...readyAsyncToolResults.map((r) => r.tool_result)];
  if (toolResults.length > 0) {
    return toolResults.map((toolResult) => ({
      role: "tool",
      content: jsonDumps(toolResult.output),
      tool_call_id: toolResult.tool_use_id,
      name: toolResult.tool_name,
    }));
  }
  return null;
}

function buildGenerationOutputMessage(assistantText: string, toolUses: Row[]): Row {
  const output: Row = { role: "assistant", content: assistantText || "" };
  if (toolUses.length > 0) {
    output.tool_calls = toolUses.map((toolUse) => ({
      id: toolUse.id,
      name: toolUse.name,
      arguments: typeof toolUse.input === "object" && toolUse.input !== null && !Array.isArray(toolUse.input) ? toolUse.input : {},
    }));
  }
  return output;
}

// ----------------- Tool spans -----------------
function getToolInputForObservation(toolUse: Row): Json {
  const raw = toolUse.input;
  const isScalarOrContainer =
    typeof raw === "object" || typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean";
  const toolInputRaw = isScalarOrContainer && raw !== null ? raw : {};
  if (typeof toolInputRaw === "string") {
    return truncateText(toolInputRaw)[0];
  }
  return toolInputRaw;
}

function getToolResultForObservation(toolResultEntry: Json): ToolResultForObservation {
  const empty: ToolResultForObservation = {
    output: null,
    result_timestamp: null,
    final_output: null,
    final_result_timestamp: null,
  };
  if (typeof toolResultEntry !== "object" || toolResultEntry === null) {
    return empty;
  }

  const outputRaw = toolResultEntry.content;
  const outputStr = typeof outputRaw === "string" ? outputRaw : jsonDumps(outputRaw);
  const [output] = truncateText(outputStr);
  const resultTimestamp = parseTimestamp(toolResultEntry.timestamp);

  const finalOutputRaw = toolResultEntry.final_content;
  if (finalOutputRaw === undefined || finalOutputRaw === null) {
    return { output, result_timestamp: resultTimestamp, final_output: null, final_result_timestamp: null };
  }

  const finalOutputStr = typeof finalOutputRaw === "string" ? finalOutputRaw : jsonDumps(finalOutputRaw);
  const [finalOutput] = truncateText(finalOutputStr);
  const finalResultTimestamp = parseTimestamp(toolResultEntry.final_timestamp);
  return {
    output,
    result_timestamp: resultTimestamp,
    final_output: finalOutput,
    final_result_timestamp: finalResultTimestamp,
  };
}

function getShortTranscriptPathForMetadata(p: unknown): string | null {
  if (typeof p === "string" && p) {
    // Return the basename, mirroring Path(path).name.
    const parts = p.split(/[/\\]/);
    return parts[parts.length - 1] || null;
  }
  return null;
}

function buildToolMetadataAttributes(
  toolName: string,
  toolUseId: string,
  subagent: SubagentTranscript | null
): Record<string, Json> {
  // Plain span attributes, NOT lmnr.association.properties.metadata.* —
  // association metadata propagates to the whole trace, so per-tool details
  // there would pollute (and race on) the trace-level metadata.
  const attrs: Record<string, Json> = {
    "claude_code.tool.name": toolName,
    "claude_code.tool.id": toolUseId,
  };
  if (subagent) {
    if (typeof subagent.agentType === "string" && subagent.agentType) {
      attrs["claude_code.subagent.type"] = subagent.agentType;
    }
    if (typeof subagent.description === "string" && subagent.description) {
      attrs["claude_code.subagent.description"] = subagent.description;
    }
  }
  return attrs;
}

function emitSingleToolObservation(
  emitter: TraceEmitter,
  parentSpan: SpanHandle,
  turn: Turn,
  assistantTimestamp: Date | null,
  toolUse: Row,
  subagentMap: Record<string, SubagentTranscript> | null,
  pendingSubagents: PendingSubagent[],
  pendingAsyncToolResults: PendingAsyncToolResult[]
): EmittedSingleToolObservation {
  const toolUseId = String(toolUse.id || "");
  const toolName = toolUse.name || "unknown";
  const toolInput = getToolInputForObservation(toolUse);

  const toolResultEntry = toolUseId ? turn.toolResultsById[toolUseId] : null;
  const toolResult = getToolResultForObservation(toolResultEntry);

  let toolOutput: Json = toolResult.output;
  if (CAPTURE_SKILL_CONTENT) {
    const injected = toolUseId ? turn.injectedByToolId[toolUseId] : null;
    if (injected) {
      const [injectedTrunc] = truncateText(injected);
      toolOutput = { result: toolResult.output, injected_instructions: injectedTrunc };
    }
  }

  const subagent = subagentMap && toolUseId ? subagentMap[toolUseId] ?? null : null;

  const toolUseTimestamp = parseTimestamp(turn.toolUseTimestampsById[toolUseId]) ?? assistantTimestamp;
  const toolSpan = startSpan(emitter, {
    name: toolName,
    parent: parentSpan,
    startTime: toolUseTimestamp,
    spanType: "TOOL",
    inputValue: toolInput,
    attributes: buildToolMetadataAttributes(toolName, toolUseId, subagent),
  });
  if (toolOutput !== null && toolOutput !== undefined) {
    toolSpan.setAttributes({ [SPAN_OUTPUT_ATTR]: jsonDumps(toolOutput) });
  }

  // Subagent subtrees nest under their launching Agent/Task tool span so the
  // frontend groups them automatically.
  let subagentEndTimestamp: Date | null = null;
  if (subagent) {
    if (toolResult.final_result_timestamp !== null) {
      pendingSubagents.push({
        tool_use_id: toolUseId,
        subagent,
        parent_span: toolSpan,
        start_timestamp: toolUseTimestamp,
        ready_timestamp: toolResult.final_result_timestamp,
      });
    } else {
      subagentEndTimestamp = emitSubagentObservations(emitter, toolSpan, subagent, toolUseTimestamp);
    }
  }

  const toolEndTimestamp = getLatestTimestamp(
    toolResult.result_timestamp,
    toolResult.final_result_timestamp,
    subagentEndTimestamp,
    toolUseTimestamp
  );
  const handoffTimestamp =
    toolResult.result_timestamp ?? toolResult.final_result_timestamp ?? subagentEndTimestamp ?? assistantTimestamp;
  toolSpan.end(toolEndTimestamp);

  if (toolResult.final_result_timestamp !== null && toolResult.final_output !== null) {
    pendingAsyncToolResults.push({
      timestamp: toolResult.final_result_timestamp,
      tool_result: { tool_use_id: toolUseId, tool_name: toolName, output: toolResult.final_output },
    });
  }

  return {
    handoff_timestamp: handoffTimestamp,
    tool_result: { tool_use_id: toolUseId, tool_name: toolName, output: toolResult.output },
    latest_end_timestamp: getLatestTimestamp(toolEndTimestamp, subagentEndTimestamp),
  };
}

function emitToolObservationBatch(
  emitter: TraceEmitter,
  parentSpan: SpanHandle,
  turn: Turn,
  assistantMessage: Row,
  toolUses: Row[],
  subagentMap: Record<string, SubagentTranscript> | null,
  pendingSubagents: PendingSubagent[],
  pendingAsyncToolResults: PendingAsyncToolResult[]
): EmittedToolObservationBatch {
  const assistantTimestamp = parseTimestamp(assistantMessage);
  const resultTimestamps: Date[] = [];
  const toolResults: GenerationToolResult[] = [];
  let latestEndTimestamp: Date | null = null;

  for (const toolUse of toolUses) {
    const emittedTool = emitSingleToolObservation(
      emitter,
      parentSpan,
      turn,
      assistantTimestamp,
      toolUse,
      subagentMap,
      pendingSubagents,
      pendingAsyncToolResults
    );
    if (emittedTool.handoff_timestamp !== null) {
      resultTimestamps.push(emittedTool.handoff_timestamp);
    }
    toolResults.push(emittedTool.tool_result);
    latestEndTimestamp = getLatestTimestamp(latestEndTimestamp, emittedTool.latest_end_timestamp);
  }

  return { result_timestamps: resultTimestamps, tool_results: toolResults, latest_end_timestamp: latestEndTimestamp };
}

// ----------------- Turn and subagent spans -----------------
function getReadySubagents(
  pendingSubagents: PendingSubagent[],
  assistantTimestamp: Date | null
): [PendingSubagent[], PendingSubagent[]] {
  const ready: PendingSubagent[] = [];
  const stillPending: PendingSubagent[] = [];
  for (const pending of pendingSubagents) {
    const readyTimestamp = pending.ready_timestamp;
    if (
      readyTimestamp instanceof Date &&
      (assistantTimestamp === null || readyTimestamp.getTime() <= assistantTimestamp.getTime())
    ) {
      ready.push(pending);
    } else {
      stillPending.push(pending);
    }
  }
  return [ready, stillPending];
}

function getReadyAsyncToolResults(
  pendingAsyncToolResults: PendingAsyncToolResult[],
  assistantTimestamp: Date | null
): [PendingAsyncToolResult[], PendingAsyncToolResult[], Date | null] {
  const ready: PendingAsyncToolResult[] = [];
  const stillPending: PendingAsyncToolResult[] = [];
  for (const result of pendingAsyncToolResults) {
    const ts = result.timestamp;
    if (ts instanceof Date && (assistantTimestamp === null || ts.getTime() <= assistantTimestamp.getTime())) {
      ready.push(result);
    } else {
      stillPending.push(result);
    }
  }
  const latestReadyTimestamp = getLatestTimestamp(...ready.map((r) => r.timestamp));
  return [ready, stillPending, latestReadyTimestamp];
}

function updatePendingSubagentDisplayStartAfterLaunchResponse(
  pendingSubagents: PendingSubagent[],
  toolResultsUsedAsGenerationInput: GenerationToolResult[],
  generationStartTimestamp: Date | null
): void {
  if (generationStartTimestamp === null) {
    return;
  }
  const toolUseIds = new Set(
    toolResultsUsedAsGenerationInput.filter((r) => r.tool_use_id).map((r) => String(r.tool_use_id))
  );
  if (toolUseIds.size === 0) {
    return;
  }
  for (const pending of pendingSubagents) {
    if (pending.display_start_timestamp !== undefined && pending.display_start_timestamp !== null) {
      continue;
    }
    if (toolUseIds.has(pending.tool_use_id)) {
      // Nudge just after the launch generation so the subagent renders after
      // it. Dates are ms-resolution, so we use +1ms (Python used +1µs).
      pending.display_start_timestamp = new Date(generationStartTimestamp.getTime() + 1);
    }
  }
}

function buildGenerationAttributes(
  assistantIndex: number,
  assistantMessage: Row,
  userText: string,
  previousToolResults: GenerationToolResult[],
  readyAsyncToolResults: PendingAsyncToolResult[]
): [Record<string, Json>, Row[]] {
  const [assistantText] = truncateText(extractTextFromContent(getContentFromRow(assistantMessage)));
  const toolUses = getToolUseBlocks(getContentFromRow(assistantMessage));

  const model = getModel(assistantMessage);
  const attrs: Record<string, Json> = {
    "gen_ai.system": "anthropic",
    "gen_ai.request.model": model,
    "gen_ai.response.model": model,
  };

  const inputMessages = buildGenerationInputMessages(assistantIndex, userText, previousToolResults, readyAsyncToolResults);
  if (inputMessages !== null) {
    attrs["gen_ai.input.messages"] = jsonDumps(inputMessages);
  }
  attrs["gen_ai.output.messages"] = jsonDumps([buildGenerationOutputMessage(assistantText, toolUses)]);

  const usageDetails = getUsageDetailsFromRow(assistantMessage);
  if (usageDetails !== null) {
    let total = 0;
    for (const [key, value] of Object.entries(usageDetails)) {
      attrs[`gen_ai.usage.${key}`] = value;
      total += value;
    }
    attrs["llm.usage.total_tokens"] = total;
  }

  return [attrs, toolUses];
}

function emitSubagentObservations(
  emitter: TraceEmitter,
  parentSpan: SpanHandle,
  subagent: SubagentTranscript,
  startTimestamp: Date | null
): Date | null {
  const p = subagent.path;
  if (typeof p !== "string") {
    return startTimestamp;
  }
  const rows = readSubagentJsonl(p);
  if (rows === null) {
    return startTimestamp;
  }

  const turns = buildTurns(rows);
  if (turns.length === 0) {
    return startTimestamp;
  }

  const firstTurn = turns[0]!;
  const subagentStartTimestamp = startTimestamp ?? parseTimestamp(firstTurn.userMsg);
  const [subagentInputText] = truncateText(extractTextFromContent(getContentFromRow(firstTurn.userMsg)));

  const lastTurn = turns[turns.length - 1]!;
  const lastAssistant = lastTurn.assistantMsgs[lastTurn.assistantMsgs.length - 1];
  const [subagentOutputText] = truncateText(extractTextFromContent(lastAssistant ? getContentFromRow(lastAssistant) : ""));

  const description = subagent.description;
  const subagentName = typeof description === "string" && description ? `Subagent: ${description}` : "Subagent";
  const subagentAttrs: Record<string, Json> = {};
  if (typeof subagent.agentType === "string" && subagent.agentType) {
    subagentAttrs["claude_code.subagent.type"] = subagent.agentType;
  }
  const subagentSpan = startSpan(emitter, {
    name: subagentName,
    parent: parentSpan,
    startTime: subagentStartTimestamp,
    spanType: "DEFAULT",
    inputValue: { role: "user", content: subagentInputText },
    attributes: subagentAttrs,
  });

  let latestEndTimestamp = subagentStartTimestamp;
  let previousStartTimestamp = subagentStartTimestamp;
  for (const turn of turns) {
    const latestTurnTimestamp = emitTurnObservations(emitter, subagentSpan, turn, previousStartTimestamp, "Subagent LLM Call", null);
    latestEndTimestamp = getLatestTimestamp(latestEndTimestamp, latestTurnTimestamp);
    if (latestTurnTimestamp !== null) {
      previousStartTimestamp = latestTurnTimestamp;
    }
  }

  subagentSpan.setAttributes({ [SPAN_OUTPUT_ATTR]: jsonDumps({ role: "assistant", content: subagentOutputText }) });
  subagentSpan.end(getLatestTimestamp(latestEndTimestamp, subagentStartTimestamp));

  return latestEndTimestamp;
}

/** Emit a turn's generations and tool spans under an existing span. */
function emitTurnObservations(
  emitter: TraceEmitter,
  parentSpan: SpanHandle,
  turn: Turn,
  startTimestamp: Date | null,
  generationPrefix = "LLM Call",
  subagentMap: Record<string, SubagentTranscript> | null = null
): Date | null {
  const [userText] = truncateText(extractTextFromContent(getContentFromRow(turn.userMsg)));
  let previousTimestamp = startTimestamp;
  let previousToolResults: GenerationToolResult[] = [];
  let pendingAsyncToolResults: PendingAsyncToolResult[] = [];
  let pendingSubagents: PendingSubagent[] = [];
  let latestEndTimestamp = startTimestamp;

  turn.assistantMsgs.forEach((assistantMessage, assistantIndex) => {
    const assistantTimestamp = parseTimestamp(assistantMessage);
    if (assistantIndex > 0 && pendingSubagents.length > 0) {
      const [readySubagents, stillPending] = getReadySubagents(pendingSubagents, assistantTimestamp);
      pendingSubagents = stillPending;
      for (const readySubagent of readySubagents) {
        const subagentEndTimestamp = emitSubagentObservations(
          emitter,
          readySubagent.parent_span ?? parentSpan,
          readySubagent.subagent,
          readySubagent.display_start_timestamp ?? readySubagent.start_timestamp
        );
        latestEndTimestamp = getLatestTimestamp(latestEndTimestamp, subagentEndTimestamp);
      }
    }

    let readyAsyncToolResults: PendingAsyncToolResult[] = [];
    if (assistantIndex > 0 && pendingAsyncToolResults.length > 0) {
      const [ready, stillPending, readyTs] = getReadyAsyncToolResults(pendingAsyncToolResults, assistantTimestamp);
      readyAsyncToolResults = ready;
      pendingAsyncToolResults = stillPending;
      previousTimestamp = getLatestTimestamp(previousTimestamp, readyTs);
    }

    const [generationAttrs, toolUses] = buildGenerationAttributes(
      assistantIndex,
      assistantMessage,
      userText,
      previousToolResults,
      readyAsyncToolResults
    );
    const generationStartTimestamp = previousTimestamp ?? assistantTimestamp;
    const generationSpan = startSpan(emitter, {
      name: `${generationPrefix} ${assistantIndex + 1}`,
      parent: parentSpan,
      startTime: generationStartTimestamp,
      spanType: "LLM",
      attributes: generationAttrs,
    });
    updatePendingSubagentDisplayStartAfterLaunchResponse(pendingSubagents, previousToolResults, generationStartTimestamp);

    const emittedTools = emitToolObservationBatch(
      emitter,
      parentSpan,
      turn,
      assistantMessage,
      toolUses,
      subagentMap,
      pendingSubagents,
      pendingAsyncToolResults
    );
    latestEndTimestamp = getLatestTimestamp(latestEndTimestamp, emittedTools.latest_end_timestamp);

    const generationEndTimestamp = assistantTimestamp ?? generationStartTimestamp;
    generationSpan.end(generationEndTimestamp);
    latestEndTimestamp = getLatestTimestamp(latestEndTimestamp, generationEndTimestamp);

    previousToolResults = emittedTools.tool_results;
    if (emittedTools.result_timestamps.length > 0) {
      previousTimestamp = getLatestTimestamp(...emittedTools.result_timestamps);
    } else if (assistantTimestamp !== null) {
      previousTimestamp = assistantTimestamp;
    }
  });

  for (const pendingSubagent of pendingSubagents) {
    const subagentEndTimestamp = emitSubagentObservations(
      emitter,
      pendingSubagent.parent_span ?? parentSpan,
      pendingSubagent.subagent,
      pendingSubagent.display_start_timestamp ?? pendingSubagent.start_timestamp
    );
    latestEndTimestamp = getLatestTimestamp(latestEndTimestamp, subagentEndTimestamp);
  }

  return latestEndTimestamp;
}

function getTurnEndTimestamp(turn: Turn): Date | null {
  const lastAssistant = turn.assistantMsgs.length > 0 ? turn.assistantMsgs[turn.assistantMsgs.length - 1] : null;
  const candidates: Date[] = [];
  const lastAssistantTimestamp = lastAssistant ? parseTimestamp(lastAssistant) : null;
  if (lastAssistantTimestamp !== null) {
    candidates.push(lastAssistantTimestamp);
  }
  for (const toolResultEntry of Object.values(turn.toolResultsById)) {
    const timestamp = parseTimestamp(toolResultEntry);
    if (timestamp !== null) {
      candidates.push(timestamp);
    }
  }
  return getLatestTimestamp(...candidates);
}

function buildTraceRootAttributes(
  config: LaminarConfig,
  sessionId: string,
  turnNum: number,
  turn: Turn,
  transcriptPath: string
): Record<string, Json> {
  const attrs: Record<string, Json> = {
    [`${ASSOC_PREFIX}.session_id`]: sessionId,
    [`${ASSOC_PREFIX}.tags`]: getTraceTags(turn),
    [`${ASSOC_PREFIX}.metadata.source`]: "claude-code",
    [`${ASSOC_PREFIX}.metadata.turn_number`]: String(turnNum),
    [`${ASSOC_PREFIX}.metadata.transcript`]: getShortTranscriptPathForMetadata(transcriptPath) ?? "",
  };
  if (config.userId) {
    attrs[`${ASSOC_PREFIX}.user_id`] = config.userId;
  }
  // Transcript rows carry the project dir and git branch so traces from
  // different projects/worktrees are distinguishable in Laminar.
  for (const [srcKey, dstKey] of [
    ["cwd", "cwd"],
    ["gitBranch", "git_branch"],
  ] as const) {
    const value = turn.userMsg[srcKey];
    if (typeof value === "string" && value) {
      attrs[`${ASSOC_PREFIX}.metadata.${dstKey}`] = value;
    }
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
  subagentMap: Record<string, SubagentTranscript> | null = null
): void {
  const [userText] = truncateText(extractTextFromContent(getContentFromRow(turn.userMsg)));

  const lastAssistant = turn.assistantMsgs[turn.assistantMsgs.length - 1]!;
  const [finalAssistantText] = truncateText(extractTextFromContent(getContentFromRow(lastAssistant)));

  const userTs = parseTimestamp(turn.userMsg);
  const lastAssistantTs = parseTimestamp(lastAssistant);
  const turnEndTs = getTurnEndTimestamp(turn);

  const rootSpan = startSpan(emitter, {
    name: traceDisplayName(sessionId, turnNum),
    parent: null,
    startTime: userTs,
    spanType: "DEFAULT",
    inputValue: { role: "user", content: userText },
    attributes: buildTraceRootAttributes(config, sessionId, turnNum, turn, transcriptPath),
  });
  const obsEndTs = emitTurnObservations(emitter, rootSpan, turn, userTs, "LLM Call", subagentMap);
  rootSpan.setAttributes({ [SPAN_OUTPUT_ATTR]: jsonDumps({ role: "assistant", content: finalAssistantText }) });
  rootSpan.end(getLatestTimestamp(turnEndTs, lastAssistantTs, obsEndTs, userTs));
}

// ----------------- New turn emission orchestration -----------------
export function emitReadyTurns(
  emitter: TraceEmitter,
  config: LaminarConfig,
  sessionId: string,
  transcriptPath: string,
  turnsToEmit: Turn[],
  sessionState: SessionState,
  subagentMap: Record<string, SubagentTranscript>,
  emitTurnFn: typeof emitTurn = emitTurn
): number {
  let emitted = 0;
  for (const turn of turnsToEmit) {
    const turnNum = sessionState.turnCount + emitted + 1;
    try {
      emitTurnFn(emitter, config, sessionId, turnNum, turn, transcriptPath, subagentMap);
    } catch (e) {
      // Log at INFO so emit failures are visible without CC_LMNR_DEBUG=true.
      // The failed turn is not counted, so turnCount only reflects turns whose
      // spans were actually built.
      info(`emitTurn failed: ${e}`);
      continue;
    }
    emitted += 1;
  }
  return emitted;
}

/**
 * Split off an incomplete trailing turn — a user prompt not yet followed by any
 * assistant row — so it is held for the next run instead of dropped. Returns
 * [rowsToProcessNow, rowsToHold].
 */
function splitTrailingIncompleteTurn(rows: Row[]): [Row[], Row[]] {
  let lastUserIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.isMeta || isToolResult(row) || isTaskNotificationRow(row)) {
      continue;
    }
    if (getUserOrAssistantRoleFromRow(row) === "user") {
      lastUserIdx = i;
    }
  }
  if (lastUserIdx < 0) {
    return [rows, []];
  }
  const tail = rows.slice(lastUserIdx);
  const tailHasAssistant = tail.some((r) => getUserOrAssistantRoleFromRow(r) === "assistant");
  if (tailHasAssistant) {
    return [rows, []];
  }
  return [rows.slice(0, lastUserIdx), tail];
}

export function getNewTurnsFromTranscript(
  transcriptPath: string,
  sessionState: SessionState,
  subagentMap?: Record<string, SubagentTranscript>,
  flushDeferredAgentTurns = false
): [Turn[], SessionState] {
  let rows: Row[];
  [rows, sessionState] = readNewJsonl(transcriptPath, sessionState);
  // Replay an incomplete trailing turn held from a prior run (chronologically
  // oldest), then let it flow through the normal pipeline.
  if (sessionState.pendingTurnRows.length > 0) {
    rows = [...sessionState.pendingTurnRows, ...rows];
    sessionState.pendingTurnRows = [];
  }
  const taskIdToToolUseId = getTaskIdToToolUseId(subagentMap);

  let [deferredTurnRowLists, remainingRows] = resolveDeferredAgentTurns(rows, sessionState, taskIdToToolUseId);

  // Hold back an incomplete trailing turn (except at SessionEnd, which flushes
  // everything) so its user row is re-read with the assistant response next run.
  if (!flushDeferredAgentTurns) {
    const [keep, hold] = splitTrailingIncompleteTurn(remainingRows);
    sessionState.pendingTurnRows = hold;
    remainingRows = keep;
  }

  if (flushDeferredAgentTurns && sessionState.pendingAgentTurns.length > 0) {
    const flushedRowLists = popAllDeferredAgentTurnRowLists(sessionState);
    if (flushedRowLists.length > 0) {
      debug(`Flushing ${flushedRowLists.length} deferred agent turn(s) without task notification`);
      deferredTurnRowLists = deferredTurnRowLists.concat(flushedRowLists);
    }
  }

  if (flushDeferredAgentTurns && sessionState.pendingTaskNotifications.length > 0) {
    debug(`Dropping ${sessionState.pendingTaskNotifications.length} unresolved task notification(s) at session end`);
    sessionState.pendingTaskNotifications = [];
  }

  // Each deferred row list is a complete turn from an earlier hook run, so it
  // is rebuilt in isolation and emitted before the current batch (its rows are
  // always chronologically older than anything in the batch).
  const turns: Turn[] = [];
  for (const deferredTurnRows of deferredTurnRowLists) {
    turns.push(...buildTurns(deferredTurnRows, taskIdToToolUseId));
  }
  if (remainingRows.length > 0) {
    turns.push(...buildTurns(remainingRows, taskIdToToolUseId));
  }

  return [turns, sessionState];
}

export interface EmitNewTurnsOptions {
  flushDeferredAgentTurns?: boolean;
  exportFn?: (emitter: TraceEmitter) => Promise<boolean>;
}

export async function emitNewTurnsFromTranscript(
  emitter: TraceEmitter,
  config: LaminarConfig,
  sessionId: string,
  transcriptPath: string,
  opts: EmitNewTurnsOptions = {}
): Promise<number> {
  const flushDeferredAgentTurns = opts.flushDeferredAgentTurns ?? false;
  const exportFn = opts.exportFn ?? exportWithTimeout;

  return withStateLock(async () => {
    const state = loadHookState();
    const key = getSessionStateKey(sessionId, transcriptPath);
    let sessionState = getSessionState(state, key);

    const subagentMap = getSubagentTranscriptsByToolUseId(transcriptPath);
    if (Object.keys(subagentMap).length > 0) {
      debug(`Discovered ${Object.keys(subagentMap).length} subagent transcript(s)`);
    }

    let turns: Turn[];
    [turns, sessionState] = getNewTurnsFromTranscript(transcriptPath, sessionState, subagentMap, flushDeferredAgentTurns);
    if (turns.length === 0) {
      saveSessionState(state, key, sessionState);
      return 0;
    }

    const turnsToEmit = getTurnsToEmit(turns, sessionState, flushDeferredAgentTurns);
    const emitted = emitReadyTurns(emitter, config, sessionId, transcriptPath, turnsToEmit, sessionState, subagentMap);

    // Only persist the advanced offset after a successful export; on failure the
    // old state stays on disk so the next hook run re-reads the same bytes and
    // retries.
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
