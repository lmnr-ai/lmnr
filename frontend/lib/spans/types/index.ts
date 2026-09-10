import { type ModelMessage } from "ai";
import { isArray, isNumber, isString } from "lodash";

import { type Message } from "@/lib/playground/types";
import { type ChatMessage, type ChatMessageContentPart } from "@/lib/types";

const processContentPart = (
  part: ChatMessageContentPart | any,
  store: Map<string, string>,
  role?: string,
  message?: any
): any => {
  switch (part.type) {
    case "text":
      return {
        type: "text" as const,
        text: part.text,
      };

    case "image_url":
      if ("image_url" in part) {
        return {
          type: "image" as const,
          image: part.image_url.url,
        };
      }
      return {
        type: "image" as const,
        image: part.url,
      };

    case "image": {
      const dataUrl = part.data.startsWith("data:") ? part.data : `data:${part.mediaType};base64,${part.data}`;
      return {
        type: "image" as const,
        image: dataUrl,
      };
    }

    case "document_url":
      return {
        type: "file" as const,
        data: part.url,
        mimeType: part.mediaType,
      };

    case "tool_call": {
      const toolCallId = part.id;
      const toolName = part.name;
      if (toolCallId) {
        store.set(toolCallId, toolName);
      }
      return {
        type: "tool-call" as const,
        toolCallId: toolCallId || "",
        toolName,
        input: part.arguments,
      };
    }

    default:
      if (role === "tool") {
        const toolCallId = part.toolCallId || message?.tool_call_id || "-";
        const toolName = store.get(toolCallId) || part.toolName || "-";
        return {
          type: "tool-result" as const,
          toolCallId,
          toolName,
          output: { type: "text", value: part.type === "text" ? part.text : JSON.stringify(part) },
        };
      }

      return {
        type: "text" as const,
        text: JSON.stringify(part),
      };
  }
};

const processMessageContent = (
  content: string | ChatMessageContentPart[] | any,
  store: Map<string, string>,
  role?: string,
  message?: any
): string | any[] => {
  if (role === "tool") {
    if (typeof content === "string") {
      return [
        {
          type: "tool-result" as const,
          toolCallId: message?.tool_call_id || "-",
          toolName: store.get(message?.tool_call_id) || "-",
          output: { type: "text", value: content },
        },
      ];
    }
    if (Array.isArray(content) && content.every((part) => part.type === "tool-result")) {
      return content;
    }
  }

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((part) => processContentPart(part, store, role, message));
  }

  return JSON.stringify(content);
};

const isMessageObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  "role" in value &&
  ("content" in value || "parts" in value);

// A headerless content part: has a string `type` but no message-level keys.
const isContentPart = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { type?: unknown }).type === "string" &&
  !("role" in value) &&
  !("content" in value) &&
  !("parts" in value);

const ASSISTANT_PART_TYPES = new Set(["reasoning", "thinking", "tool-call", "tool_call", "tool-approval-request"]);
const TOOL_PART_TYPES = new Set(["tool-result", "tool_call_response", "tool-approval-response"]);

// A bare parts array carries no role; infer one from the parts it holds.
const inferRoleFromParts = (parts: unknown[]): string => {
  const types = new Set(parts.map((p) => (p as { type?: string })?.type ?? ""));
  if ([...TOOL_PART_TYPES].some((t) => types.has(t))) return "tool";
  if ([...ASSISTANT_PART_TYPES].some((t) => types.has(t))) return "assistant";
  return "user";
};

// Wrap a single message object or a bare parts array into a message array; no-op otherwise.
export const normalizeToMessages = (data: unknown): unknown => {
  if (isMessageObject(data)) return [data];
  if (Array.isArray(data) && data.length > 0 && data.every(isContentPart)) {
    return [{ role: inferRoleFromParts(data), content: data }];
  }
  return data;
};

export const convertToMessages = (
  messages: ChatMessage[] | Record<string, unknown> | string | undefined
): (Omit<ModelMessage, "role"> & { role?: ModelMessage["role"] })[] => {
  if (isString(messages) || isNumber(messages)) {
    return [
      {
        content: String(messages),
      },
    ];
  }

  if (isArray(messages)) {
    const store = new Map<string, string>();
    return messages.map((message) => {
      if (isString(message) || isNumber(message)) {
        return {
          content: String(message),
        } as ModelMessage;
      }

      if (typeof message === "object" && message !== null && "content" in message) {
        const role = message.role;
        const processedContent = processMessageContent(message.content, store, role, message);
        return {
          role: role,
          content: processedContent,
        };
      }
      return {
        content: JSON.stringify(message),
      } as ModelMessage;
    });
  }

  return [
    {
      content: JSON.stringify(messages),
    },
  ];
};

export const convertToPlaygroundMessages = async (messages: ChatMessage[]): Promise<Message[]> =>
  convertToMessages(messages).map((message) => {
    if (typeof message.content === "string") {
      return {
        ...message,
        content: [{ type: "text" as const, text: message.content }],
      } as Message;
    }
    return message as Message;
  });
