import { isNil, takeRight } from "lodash";

import { type MessageLabel, type ProcessedMessages, processMessages } from "@/components/traces/span-view/messages";
import { convertToMessages, normalizeToMessages } from "@/lib/spans/types";
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

// Flatten a side to generic ModelMessage[] so two different formats can share one list.
const toGenericMessages = (p: ProcessedMessages, normalized: unknown): ProcessedMessages["messages"] =>
  p.type === "generic" ? p.messages : convertToMessages(normalized as Parameters<typeof convertToMessages>[0]);

// Detect input and output separately, then merge into one list: same-type sides keep their
// rich renderer, mixed formats (e.g. OpenAI input + GenAI output) share a generic one.
const combineMessages = (
  input: unknown,
  output: unknown
): { processed: ProcessedMessages | undefined; labels: MessageLabel[] } => {
  const inputNorm = isNil(input) ? null : normalizeToMessages(input);
  const outputNorm = isNil(output) ? null : normalizeToMessages(output);
  const inputProcessed = inputNorm == null ? null : processMessages(inputNorm);
  const outputProcessed = outputNorm == null ? null : processMessages(outputNorm);

  let type: ProcessedMessages["type"] = "generic";
  let inputMsgs: ProcessedMessages["messages"] = [];
  let outputMsgs: ProcessedMessages["messages"] = [];
  if (inputProcessed && outputProcessed) {
    if (inputProcessed.type === outputProcessed.type) {
      type = inputProcessed.type;
      inputMsgs = inputProcessed.messages.slice(-2);
      outputMsgs = outputProcessed.messages;
    } else {
      inputMsgs = toGenericMessages(inputProcessed, inputNorm).slice(-2);
      outputMsgs = toGenericMessages(outputProcessed, outputNorm);
    }
  } else if (inputProcessed) {
    type = inputProcessed.type;
    inputMsgs = inputProcessed.messages.slice(-2);
  } else if (outputProcessed) {
    type = outputProcessed.type;
    outputMsgs = outputProcessed.messages;
  }

  const processed =
    inputProcessed || outputProcessed
      ? ({ type, messages: [...inputMsgs, ...outputMsgs] } as ProcessedMessages)
      : undefined;

  const labels: MessageLabel[] = [];
  if (inputMsgs.length > 0) {
    labels.push({
      beforeIndex: 0,
      text: "Input",
      subtext: inputMsgs.length === 1 ? "(last message)" : "(last 2 messages)",
    });
  }
  if (outputMsgs.length > 0) {
    labels.push({ beforeIndex: inputMsgs.length, text: "Output" });
  }

  return { processed, labels };
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
): { mergedValue: string; messageLabels: MessageLabel[]; processedMessages: ProcessedMessages | undefined } => {
  const input = normalize(inputData);
  const output = normalize(outputData);
  const { processed, labels } = combineMessages(input, output);
  return { mergedValue: buildRawValue(input, output), messageLabels: labels, processedMessages: processed };
};
