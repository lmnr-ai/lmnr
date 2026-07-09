import {
  extractTextFromContent,
  getContentFromRow,
  getMessageId,
  getToolResultBlocks,
  getToolUseBlocks,
  getUserOrAssistantRoleFromRow,
  isToolResult,
} from "./transcript.js";
import {
  getResultFromTaskNotification,
  getToolUseIdForTaskNotification,
  isTaskNotificationRow,
} from "./notifications.js";
import { jsonDumps } from "./util.js";
import type { Json, Row } from "./types.js";

// ----------------- Turn model -----------------
/**
 * A tool's result as assembled from the transcript. `content`/`timestamp` are
 * the initial result; `final*` are set later when an async agent's
 * task-notification lands; `isAsyncLaunch` marks a deferred-agent launch.
 */
export interface ToolResultEntry {
  content: Json;
  timestamp?: Json;
  isAsyncLaunch?: boolean;
  finalContent?: Json;
  finalTimestamp?: Json;
}

export interface Turn {
  userMsg: Row;
  assistantMsgs: Row[];
  toolResultsById: Record<string, ToolResultEntry>;
  toolUseTimestampsById: Record<string, Json>;
  // Injected context (e.g. skill instructions) keyed by the tool_use id it
  // belongs to, taken from isMeta rows carrying sourceToolUseID.
  injectedByToolId: Record<string, string>;
  rows: Row[];
}

class TurnAssemblyState {
  currentTurnUserRow: Row | null = null;
  assistantMessageIds: string[] = [];
  assistantRowsByMessageId: Record<string, Row[]> = {};
  toolResultsById: Record<string, ToolResultEntry> = {};
  toolUseTimestampsById: Record<string, Json> = {};
  injectedByToolId: Record<string, string> = {};
  currentRows: Row[] = [];
}

// ----------------- Async-launch detection (shared with deferral) -----------------
export function getToolResultText(toolResultEntry: ToolResultEntry | undefined): string {
  if (!toolResultEntry) {
    return "";
  }
  const toolResultContent = toolResultEntry.content;
  if (typeof toolResultContent === "string") {
    return toolResultContent;
  }
  return jsonDumps(toolResultContent);
}

/**
 * Read the structured async marker Claude Code puts on tool_result rows.
 * Returns null when the row carries no toolUseResult (older Claude Code
 * versions), so callers can fall back to the launch-text heuristic.
 */
export function getAsyncLaunchFlagFromRow(row: Row): boolean | null {
  const toolUseResult = row.toolUseResult;
  if (typeof toolUseResult !== "object" || toolUseResult === null) {
    return null;
  }
  return toolUseResult.status === "async_launched" || toolUseResult.isAsync === true;
}

export function isAsyncAgentLaunchResult(toolResultEntry: ToolResultEntry | undefined): boolean {
  if (!toolResultEntry) {
    return false;
  }
  // Prefer the structured toolUseResult marker: launch-text matching also
  // fires on tool results that merely quote it (e.g. reading this file).
  if (toolResultEntry.isAsyncLaunch != null) {
    return toolResultEntry.isAsyncLaunch;
  }
  const toolResultText = getToolResultText(toolResultEntry);
  return (
    toolResultText.includes("Async agent launched successfully") ||
    (toolResultText.includes("agentId:") &&
      toolResultText.includes("output_file:") &&
      toolResultText.includes("You will be notified automatically"))
  );
}

// ----------------- Turn assembly -----------------
/**
 * Claude Code can split one assistant message across multiple JSONL rows that
 * share message.id. Merge them back into one logical message by concatenating
 * content blocks in row order.
 */
export function mergeAssistantRows(rows: Row[]): Row {
  const last = rows[rows.length - 1] ?? {};
  const base: Row = { ...last };
  const lastMessage = last.message;
  const mergedMessage: Row = typeof lastMessage === "object" && lastMessage !== null ? { ...lastMessage } : {};

  const mergedContent: Json[] = [];
  for (const row of rows) {
    const messageObj = row.message;
    if (typeof messageObj !== "object" || messageObj === null) {
      continue;
    }
    const contentBlocks = messageObj.content;
    if (Array.isArray(contentBlocks)) {
      mergedContent.push(...contentBlocks);
    } else if (typeof contentBlocks === "string" && contentBlocks) {
      mergedContent.push({ type: "text", text: contentBlocks });
    }
  }

  mergedMessage.content = mergedContent;
  base.message = mergedMessage;
  return base;
}

function buildTurnFromState(state: TurnAssemblyState): Turn | null {
  if (state.currentTurnUserRow === null) {
    return null;
  }
  if (Object.keys(state.assistantRowsByMessageId).length === 0) {
    return null;
  }

  // Rebuild one assistant message per message.id, in the order the ids first
  // appeared; merge each id's raw rows into one.
  const mergedAssistantRows: Row[] = [];
  for (const messageId of state.assistantMessageIds) {
    const rowsForId = state.assistantRowsByMessageId[messageId];
    if (!rowsForId || rowsForId.length === 0) {
      continue;
    }
    mergedAssistantRows.push(mergeAssistantRows(rowsForId));
  }

  return {
    userMsg: state.currentTurnUserRow,
    assistantMsgs: mergedAssistantRows,
    toolResultsById: { ...state.toolResultsById },
    toolUseTimestampsById: { ...state.toolUseTimestampsById },
    injectedByToolId: { ...state.injectedByToolId },
    rows: [...state.currentRows],
  };
}

function startNewTurn(row: Row, state: TurnAssemblyState): void {
  state.currentTurnUserRow = row;
  state.assistantMessageIds = [];
  state.assistantRowsByMessageId = {};
  state.toolResultsById = {};
  state.toolUseTimestampsById = {};
  state.injectedByToolId = {};
  state.currentRows = [row];
}

function addAssistantRow(row: Row, state: TurnAssemblyState): void {
  if (state.currentTurnUserRow === null) {
    // Ignore assistant rows until we see a user message.
    return;
  }
  const messageId = getMessageId(row) || `noid:${state.assistantMessageIds.length}`;
  if (!(messageId in state.assistantRowsByMessageId)) {
    state.assistantMessageIds.push(messageId);
    state.assistantRowsByMessageId[messageId] = [];
  }
  state.assistantRowsByMessageId[messageId]!.push(row);

  for (const toolUseBlock of getToolUseBlocks(getContentFromRow(row))) {
    const toolUseId = toolUseBlock.id;
    if (toolUseId) {
      const key = String(toolUseId);
      if (!(key in state.toolUseTimestampsById)) {
        state.toolUseTimestampsById[key] = row.timestamp;
      }
    }
  }
  state.currentRows.push(row);
}

function addInjectedContextRow(row: Row, state: TurnAssemblyState): boolean {
  // Injected user rows (slash-command expansions, caveats, skill instructions)
  // carry isMeta=true. They are not real prompts, so they must not start turns.
  if (!row.isMeta) {
    return false;
  }
  // Skill invocations link their injected instructions to the originating
  // tool_use via sourceToolUseID; keep the text so emit can optionally attach
  // it to that tool span.
  const sourceToolUseId = row.sourceToolUseID;
  if (sourceToolUseId) {
    const text = extractTextFromContent(getContentFromRow(row));
    if (text) {
      state.injectedByToolId[String(sourceToolUseId)] = text;
      state.currentRows.push(row);
    }
  }
  return true;
}

function addToolResultRow(row: Row, state: TurnAssemblyState): boolean {
  // tool_result rows show up as role=user with content blocks of type tool_result.
  if (!isToolResult(row)) {
    return false;
  }
  state.currentRows.push(row);
  const rowTimestamp = row.timestamp;
  const isAsyncLaunch = getAsyncLaunchFlagFromRow(row);
  for (const toolResultBlock of getToolResultBlocks(getContentFromRow(row))) {
    const toolUseId = toolResultBlock.tool_use_id;
    if (toolUseId) {
      const entry: ToolResultEntry = { content: toolResultBlock.content, timestamp: rowTimestamp };
      if (isAsyncLaunch !== null) {
        entry.isAsyncLaunch = isAsyncLaunch;
      }
      state.toolResultsById[String(toolUseId)] = entry;
    }
  }
  return true;
}

function addTaskNotificationRow(
  row: Row,
  state: TurnAssemblyState,
  taskIdToToolUseId?: Record<string, string>
): boolean {
  if (!isTaskNotificationRow(row)) {
    return false;
  }
  if (state.currentTurnUserRow === null) {
    return true;
  }
  const toolUseId = getToolUseIdForTaskNotification(row, taskIdToToolUseId);
  if (!toolUseId) {
    state.currentRows.push(row);
    return true;
  }
  const existingResult = state.toolResultsById[toolUseId];
  if (existingResult) {
    existingResult.finalContent = getResultFromTaskNotification(row);
    existingResult.finalTimestamp = row.timestamp;
  } else {
    state.toolResultsById[toolUseId] = {
      content: getResultFromTaskNotification(row),
      timestamp: row.timestamp,
    };
  }
  state.currentRows.push(row);
  return true;
}

/**
 * Groups incremental transcript rows into turns:
 * user (non-tool-result) -> assistant messages -> (tool_result rows, possibly interleaved).
 */
export function buildTurns(rows: Row[], taskIdToToolUseId?: Record<string, string>): Turn[] {
  const turns: Turn[] = [];
  const state = new TurnAssemblyState();

  for (const row of rows) {
    if (addInjectedContextRow(row, state)) {
      continue;
    }
    if (addToolResultRow(row, state)) {
      continue;
    }
    if (addTaskNotificationRow(row, state, taskIdToToolUseId)) {
      continue;
    }

    const role = getUserOrAssistantRoleFromRow(row);
    if (role === "user") {
      const turn = buildTurnFromState(state);
      if (turn !== null) {
        turns.push(turn);
      }
      startNewTurn(row, state);
      continue;
    }
    if (role === "assistant") {
      addAssistantRow(row, state);
      continue;
    }
    // Ignore unknown rows.
  }

  const turn = buildTurnFromState(state);
  if (turn !== null) {
    turns.push(turn);
  }
  return turns;
}
