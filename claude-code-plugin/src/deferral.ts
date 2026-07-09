import { MAX_PENDING_TASK_NOTIFICATIONS } from "./config.js";
import { debug } from "./logger.js";
import { getToolUseIdForTaskNotification, isTaskNotificationRow } from "./notifications.js";
import type { SessionState } from "./state.js";
import { getContentFromRow, getToolUseBlocks } from "./transcript.js";
import { isAsyncAgentLaunchResult, type Turn } from "./turns.js";
import type { Row } from "./types.js";

function findPendingAgentTurn(sessionState: SessionState, toolUseId: string): Row | null {
  for (const pendingTurn of sessionState.pendingAgentTurns) {
    if (typeof pendingTurn !== "object" || pendingTurn === null) {
      continue;
    }
    if (!Array.isArray(pendingTurn.rows)) {
      continue;
    }
    const pendingToolUseIds = pendingTurn.pending_tool_use_ids;
    const resolvedToolUseIds = pendingTurn.resolved_tool_use_ids;
    // Notifications can arrive more than once per tool_use_id, so ids that
    // already received one keep matching until the whole turn resolves.
    if (Array.isArray(pendingToolUseIds) && pendingToolUseIds.includes(toolUseId)) {
      return pendingTurn;
    }
    if (Array.isArray(resolvedToolUseIds) && resolvedToolUseIds.includes(toolUseId)) {
      return pendingTurn;
    }
  }
  return null;
}

function routeToPendingTurn(pendingTurn: Row, row: Row, toolUseId: string): void {
  pendingTurn.rows.push(row);
  const pendingToolUseIds = pendingTurn.pending_tool_use_ids;
  if (Array.isArray(pendingToolUseIds) && pendingToolUseIds.includes(toolUseId)) {
    const idx = pendingToolUseIds.indexOf(toolUseId);
    pendingToolUseIds.splice(idx, 1);
    if (!Array.isArray(pendingTurn.resolved_tool_use_ids)) {
      pendingTurn.resolved_tool_use_ids = [];
    }
    pendingTurn.resolved_tool_use_ids.push(toolUseId);
  }
}

/**
 * Move task-notification rows from the batch to their deferred turns.
 *
 * Deferred rows are never spliced into the batch (a user row mid-batch would
 * cut the current turn in half); resolved turns are returned for isolated
 * assembly. Notifications matching a tool_use in the batch stay there, and
 * ones that cannot be attributed yet (task-id-only, subagent meta.json not on
 * disk) are stashed in the session state and retried on later runs instead of
 * being swallowed by the turn assembly.
 */
export function resolveDeferredAgentTurns(
  rows: Row[],
  sessionState: SessionState,
  taskIdToToolUseId?: Record<string, string>
): [Row[][], Row[]] {
  const remainingRows: Row[] = [];
  const stashedNotifications: Row[] = [];

  // Retry stashed notifications from earlier runs first (they are older than
  // anything in the batch); their task-id may resolve now.
  for (const row of sessionState.pendingTaskNotifications) {
    const toolUseId = getToolUseIdForTaskNotification(row, taskIdToToolUseId);
    if (toolUseId === null) {
      stashedNotifications.push(row);
      continue;
    }
    const pendingTurn = findPendingAgentTurn(sessionState, toolUseId);
    if (pendingTurn === null) {
      debug(`Dropping stashed task notification for ${toolUseId}: no deferred turn waits for it`);
      continue;
    }
    routeToPendingTurn(pendingTurn, row, toolUseId);
  }

  for (const row of rows) {
    if (!isTaskNotificationRow(row)) {
      remainingRows.push(row);
      continue;
    }
    const toolUseId = getToolUseIdForTaskNotification(row, taskIdToToolUseId);
    if (toolUseId === null) {
      stashedNotifications.push(row);
      continue;
    }
    const pendingTurn = findPendingAgentTurn(sessionState, toolUseId);
    if (pendingTurn === null) {
      remainingRows.push(row);
      continue;
    }
    routeToPendingTurn(pendingTurn, row, toolUseId);
  }

  sessionState.pendingTaskNotifications = stashedNotifications.slice(-MAX_PENDING_TASK_NOTIFICATIONS);

  // Pop fully resolved turns in deferral (i.e. chronological) order.
  const resolvedTurnRowLists: Row[][] = [];
  const stillPending: Row[] = [];
  for (const pendingTurn of sessionState.pendingAgentTurns) {
    if (typeof pendingTurn !== "object" || pendingTurn === null || !Array.isArray(pendingTurn.rows)) {
      continue;
    }
    if (Array.isArray(pendingTurn.pending_tool_use_ids) && pendingTurn.pending_tool_use_ids.length > 0) {
      stillPending.push(pendingTurn);
      continue;
    }
    resolvedTurnRowLists.push(pendingTurn.rows);
  }
  sessionState.pendingAgentTurns = stillPending;

  return [resolvedTurnRowLists, remainingRows];
}

export function popAllDeferredAgentTurnRowLists(sessionState: SessionState): Row[][] {
  const rowLists: Row[][] = [];
  for (const pendingTurn of sessionState.pendingAgentTurns) {
    if (typeof pendingTurn !== "object" || pendingTurn === null) {
      continue;
    }
    const rows = pendingTurn.rows;
    if (Array.isArray(rows) && rows.length > 0) {
      rowLists.push(rows);
    }
  }
  sessionState.pendingAgentTurns = [];
  return rowLists;
}

export function getPendingAgentToolUseIds(turn: Turn): string[] {
  const toolUseIds: string[] = [];
  for (const assistantMessage of turn.assistantMsgs) {
    for (const toolUseBlock of getToolUseBlocks(getContentFromRow(assistantMessage))) {
      if (toolUseBlock.name !== "Agent" && toolUseBlock.name !== "Task") {
        continue;
      }
      const toolUseId = String(toolUseBlock.id || "");
      if (!toolUseId) {
        continue;
      }
      const toolResultEntry = turn.toolResultsById[toolUseId];
      if (
        typeof toolResultEntry === "object" &&
        toolResultEntry !== null &&
        toolResultEntry.final_content !== undefined &&
        toolResultEntry.final_content !== null
      ) {
        continue;
      }
      // Defer only explicit async launches: sync agents also write a subagent
      // transcript but never notify, so deferring on transcript existence would
      // strand their turns.
      if (isAsyncAgentLaunchResult(toolResultEntry)) {
        toolUseIds.push(toolUseId);
      }
    }
  }
  return toolUseIds;
}

export function getTurnsToEmit(
  turns: Turn[],
  sessionState: SessionState,
  flushDeferredAgentTurns = false
): Turn[] {
  const turnsToEmit: Turn[] = [];
  for (const turn of turns) {
    const pendingAgentToolUseIds = getPendingAgentToolUseIds(turn);
    if (pendingAgentToolUseIds.length > 0) {
      if (flushDeferredAgentTurns) {
        debug(`Emitting async agent turn without task notification: ${pendingAgentToolUseIds}`);
        turnsToEmit.push(turn);
        continue;
      }
      sessionState.pendingAgentTurns.push({
        pending_tool_use_ids: pendingAgentToolUseIds,
        rows: turn.rows,
      });
      debug(`Deferred agent turn until task notification: ${pendingAgentToolUseIds}`);
      continue;
    }
    turnsToEmit.push(turn);
  }
  return turnsToEmit;
}
