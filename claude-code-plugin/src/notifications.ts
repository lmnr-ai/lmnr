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

export function getToolUseIdFromTaskNotification(row: Row): string | null {
  const notificationText = extractTextFromContent(getContentFromRow(row));
  const toolUseId = extractXmlTagValue(notificationText, "tool-use-id");
  return typeof toolUseId === "string" && toolUseId.trim() ? toolUseId.trim() : null;
}

export function getTaskIdFromTaskNotification(row: Row): string | null {
  const notificationText = extractTextFromContent(getContentFromRow(row));
  const taskId = extractXmlTagValue(notificationText, "task-id");
  return typeof taskId === "string" && taskId.trim() ? taskId.trim() : null;
}

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
