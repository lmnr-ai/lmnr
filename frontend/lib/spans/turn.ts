import { isNil } from "lodash";

import { type ProcessedMessages, processMessages, responsesItemRole } from "@/lib/spans/process-messages";

const ROLE_ALIASES: Record<string, string> = {
  human: "user",
  ai: "assistant",
  model: "assistant",
  developer: "system",
  computer_call_output: "tool",
};

export const canonicalRole = (role?: string): string | undefined => {
  if (!role) return undefined;
  const lower = role.toLowerCase();
  return ROLE_ALIASES[lower] ?? lower;
};

export const segmentMessageRole = (segment: ProcessedMessages, index: number): string | undefined => {
  const message = segment.messages[index] as { role?: string; type?: string } | undefined;
  return segment.type === "openai-responses" ? responsesItemRole(message) : message?.role;
};

// Unwrap a double-serialized string payload (e.g. Gemini output stored as a JSON string).
export const normalizeSpanPayload = (data: unknown): unknown => {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
};

/**
 * An LLM call split into what the model saw for the first time on this call and what came before.
 * `previous` is the assistant run that `input` answers (tool calls for tool results), kept for context.
 * Every part is undefined when empty.
 */
export interface SpanTurn {
  system?: ProcessedMessages;
  /** The first user message (usually what the agent was asked to do), kept visible when history folds. */
  task?: ProcessedMessages;
  history?: ProcessedMessages;
  previous?: ProcessedMessages;
  input?: ProcessedMessages;
  output?: ProcessedMessages;
  /** Model calls before this one: runs of consecutive assistant messages in history + previous. */
  earlierSteps: number;
}

const slice = (processed: ProcessedMessages, start: number, end: number): ProcessedMessages | undefined =>
  end > start ? ({ ...processed, messages: processed.messages.slice(start, end) } as ProcessedMessages) : undefined;

const nonEmpty = (processed: ProcessedMessages | undefined) =>
  processed && processed.messages.length > 0 ? processed : undefined;

// Input and output are detected independently: formats overlap, and flattening mismatched sides into one
// format is lossy (an Anthropic `tool_use` output would render as raw JSON).
export const buildSpanTurn = (inputData: unknown, outputData: unknown): SpanTurn => {
  const input = normalizeSpanPayload(inputData);
  const output = normalizeSpanPayload(outputData);
  const outputProcessed = isNil(output) ? undefined : nonEmpty(processMessages(output));
  const inputProcessed = isNil(input) ? undefined : processMessages(input);
  if (!inputProcessed) return { output: outputProcessed, earlierSteps: 0 };

  const roles = inputProcessed.messages.map((_, i) => canonicalRole(segmentMessageRole(inputProcessed, i)));
  const total = roles.length;

  let systemEnd = 0;
  while (systemEnd < total && roles[systemEnd] === "system") systemEnd++;

  // The new input starts after the last assistant message; with none, everything after the system prompt is new.
  let previousEnd = total;
  while (previousEnd > systemEnd && roles[previousEnd - 1] !== "assistant") previousEnd--;
  let previousStart = previousEnd;
  while (previousStart > systemEnd && roles[previousStart - 1] === "assistant") previousStart--;

  // Pin only a task that would otherwise sit in the folded history; without a previous step it is new input.
  const taskEnd = systemEnd < previousStart && roles[systemEnd] === "user" ? systemEnd + 1 : systemEnd;

  let earlierSteps = 0;
  for (let i = systemEnd; i < previousEnd; i++) {
    if (roles[i] === "assistant" && (i === systemEnd || roles[i - 1] !== "assistant")) earlierSteps++;
  }

  return {
    earlierSteps,
    system: slice(inputProcessed, 0, systemEnd),
    task: slice(inputProcessed, systemEnd, taskEnd),
    history: slice(inputProcessed, taskEnd, previousStart),
    previous: slice(inputProcessed, previousStart, previousEnd),
    input: slice(inputProcessed, previousEnd, total),
    output: outputProcessed,
  };
};
