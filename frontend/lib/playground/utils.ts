import { type ModelMessage, type SystemModelMessage, type ToolModelMessage } from "ai";

import { type Message, type TextPart } from "@/lib/playground/types";

import { tryParseJson } from "../utils";

// Legacy rows (pre AI SDK v5) stored message content as a plain string instead
// of a parts array. Normalize those into a single text part so the editor —
// and the .map() below — always see an array.
const toContentParts = (content: Message["content"]): Message["content"] =>
  Array.isArray(content) ? content : [{ type: "text", text: String(content ?? "") } as TextPart];

export const parseSystemMessages = (messages: Message[]): ModelMessage[] =>
  messages.map((message) => {
    if (message.role === "system" && message.content?.[0]?.type === "text") {
      return {
        role: message.role,
        content: message.content[0].text,
      } as SystemModelMessage;
    }

    if (
      message.role === "user" &&
      Array.isArray(message.content) &&
      message.content.length > 0 &&
      message.content.every((part) => part.type === "tool-result")
    ) {
      return {
        role: "tool",
        content: message.content,
      } as unknown as ToolModelMessage;
    }

    return message as ModelMessage;
  });

export const transformFromLegacy = (messages: Message[]): Message[] =>
  messages.map((message) => ({
    ...message,
    content: toContentParts(message.content).map((part: any) => {
      switch (part.type) {
        case "tool-call":
          // V4 format: { type: "tool-call", toolCallId, toolName, args }
          // V5 format: { type: "tool-call", toolCallId, toolName, input }
          if ("args" in part && !("input" in part)) {
            const { args, ...rest } = part;
            return {
              ...rest,
              input: typeof args === "string" ? tryParseJson(args || "{}") : args || {},
            };
          }
          return part;

        case "tool-result":
          // V4 format: { type: "tool-result", toolCallId, toolName, result }
          // V5 format: { type: "tool-result", toolCallId, toolName, output: { type, value } }
          if ("result" in part && !("output" in part)) {
            const { result, ...rest } = part;
            return {
              ...rest,
              output: {
                type: "text",
                value: result,
              },
            };
          }
          return part;

        default:
          return part;
      }
    }),
  }));
