import { type ModelMessage, type SystemModelMessage, type ToolModelMessage } from "ai";

import { type Message } from "@/lib/playground/types";

import { tryParseJson } from "../utils";

export const parseSystemMessages = (messages: Message[]): ModelMessage[] =>
  messages.map((message) => {
    if (message.role === "system" && message.content?.[0]?.type === "text") {
      return {
        role: message.role,
        content: message.content[0].text,
        ...(message.providerOptions !== undefined && { providerOptions: message.providerOptions }),
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
        ...(message.providerOptions !== undefined && { providerOptions: message.providerOptions }),
      } as unknown as ToolModelMessage;
    }

    return message as ModelMessage;
  });

const isSystemModelMessage = (message: ModelMessage): message is SystemModelMessage =>
  message.role === "system" && typeof message.content === "string";

// v7 rejects system messages in `messages`; a system-only prompt can't be empty so it stays there.
export const extractInstructions = (
  messages: ModelMessage[]
): {
  instructions?: SystemModelMessage[];
  messages: ModelMessage[];
  allowSystemInMessages?: true;
} => {
  const instructions = messages.filter(isSystemModelMessage);
  const rest = messages.filter((message) => !isSystemModelMessage(message));

  if (rest.length === 0) {
    return { messages, allowSystemInMessages: true };
  }

  return {
    ...(instructions.length > 0 && { instructions }),
    messages: rest,
  };
};

export const transformFromLegacy = (messages: Message[]): Message[] =>
  messages.map((message) => {
    const content: Message["content"] = Array.isArray(message.content)
      ? message.content
      : [{ type: "text", text: String(message.content ?? "") }];

    return {
      ...message,
      content: content.map((part: any) => {
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
    };
  });
