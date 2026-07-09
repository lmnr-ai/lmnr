import { extractTextFromContent, getContentFromRow } from "./transcript.js";
import type { Row } from "./types.js";

function extractXmlTagValue(text: string, tag: string): string | null {
  const start = `<${tag}>`;
  const end = `</${tag}>`;
  const i = text.indexOf(start);
  if (i < 0) {
    return null;
  }
  const j = text.indexOf(end, i + start.length);
  if (j < 0) {
    return null;
  }
  return text.slice(i + start.length, j);
}

export function isTaskNotificationRow(row: Row): boolean {
  const origin = row.origin;
  if (typeof origin === "object" && origin !== null && origin.kind === "task-notification") {
    return true;
  }
  const notificationText = extractTextFromContent(getContentFromRow(row)).replace(/^\s+/, "");
  return notificationText.startsWith("<task-notification>");
}

/** Read a trimmed non-empty XML tag value from a task-notification row, else null. */
function extractTag(row: Row, tag: string): string | null {
  const value = extractXmlTagValue(extractTextFromContent(getContentFromRow(row)), tag);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export const getToolUseIdFromTaskNotification = (row: Row): string | null => extractTag(row, "tool-use-id");
export const getTaskIdFromTaskNotification = (row: Row): string | null => extractTag(row, "task-id");

export function getToolUseIdForTaskNotification(
  row: Row,
  taskIdToToolUseId?: Record<string, string>
): string | null {
  if (!isTaskNotificationRow(row)) {
    return null;
  }
  const toolUseId = getToolUseIdFromTaskNotification(row);
  if (toolUseId) {
    return toolUseId;
  }
  const taskId = getTaskIdFromTaskNotification(row);
  if (taskId && taskIdToToolUseId) {
    return taskIdToToolUseId[taskId] ?? null;
  }
  return null;
}

export function getResultFromTaskNotification(row: Row): string {
  const notificationText = extractTextFromContent(getContentFromRow(row));
  const result = extractXmlTagValue(notificationText, "result");
  return result !== null ? result : notificationText;
}
