import { isNil, takeRight } from "lodash";

import type { MessageLabel } from "@/components/traces/span-view/messages";
import { type ProcessedMessages, processMessages } from "@/lib/spans/process-messages";
import { parseOpenAIOutput } from "@/lib/spans/types/openai";

// Unwrap a double-serialized string payload (e.g. Gemini output stored as a JSON string).
const normalize = (data: unknown): unknown => {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
};

// Detect input and output independently and keep them as separate segments, each rendered in its
// own format. Formats overlap (a plain `{role, content: "str"}` input parses as OpenAI while an
// Anthropic `tool_use` output does not), and flattening mismatched sides to generic is lossy.
const combineMessages = (
  input: unknown,
  output: unknown
): { segments: ProcessedMessages[] | undefined; labels: MessageLabel[] } => {
  const inputProcessed = isNil(input) ? null : processMessages(input);
  const outputProcessed = isNil(output) ? null : processMessages(output);

  const segments: ProcessedMessages[] = [];
  const inputCount = inputProcessed ? Math.min(inputProcessed.messages.length, 2) : 0;
  if (inputProcessed) {
    segments.push({ ...inputProcessed, messages: inputProcessed.messages.slice(-2) } as ProcessedMessages);
  }
  if (outputProcessed) {
    segments.push(outputProcessed);
  }

  const labels: MessageLabel[] = [];
  if (inputCount > 0) {
    labels.push({
      beforeIndex: 0,
      text: "Input",
      subtext: inputCount === 1 ? "(last message)" : "(last 2 messages)",
    });
  }
  if (outputProcessed && outputProcessed.messages.length > 0) {
    labels.push({ beforeIndex: inputCount, text: "Output" });
  }

  return { segments: segments.length > 0 ? segments : undefined, labels };
};

// Raw payload (last 2 input messages + output) for the JSON/YAML/TEXT modes.
const buildRawValue = (input: unknown, output: unknown): string => {
  const openAIOutput = parseOpenAIOutput(output);
  const inputTail = Array.isArray(input) ? takeRight(input, 2) : isNil(input) ? [] : [input];
  const outputTail = openAIOutput ?? (isNil(output) ? [] : Array.isArray(output) ? output : [output]);
  return JSON.stringify([...inputTail, ...outputTail]);
};

// Everything the Overview needs to render: the pre-detected messages for MESSAGES mode,
// their labels, and the raw value for the other modes.
export const buildOverview = (
  inputData: unknown,
  outputData: unknown
): { mergedValue: string; messageLabels: MessageLabel[]; processedMessages: ProcessedMessages[] | undefined } => {
  const input = normalize(inputData);
  const output = normalize(outputData);
  const { segments, labels } = combineMessages(input, output);
  return { mergedValue: buildRawValue(input, output), messageLabels: labels, processedMessages: segments };
};
