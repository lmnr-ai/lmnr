import { CoreMessage } from "ai";
import { isArray, isNumber, isString } from "lodash";

export interface UserSession {
  id: string;
  name: string;
  email: string;
  apiKey: string;
  avatarUrl?: string;
}

export type ChatMessageText = {
  type: "text";
  text: string;
};

export type ChatMessageImageUrl = {
  type: "image_url";
  url: string;
  detail: string | null;
};

export type ChatMessageImage = {
  type: "image";
  mediaType: string; // e.g. "image/jpeg"
  data: string;
};

export type ChatMessageDocumentUrl = {
  type: "document_url";
  mediaType: string; // e.g. "application/pdf"
  url: string;
};

export type ChatMessageToolCall = {
  type: "tool_call";
  id?: string;
  arguments?: Record<string, unknown>;
  name: string;
};

export type ChatMessageContentPart =
  | ChatMessageText
  | ChatMessageImageUrl
  | ChatMessageImage
  | ChatMessageDocumentUrl
  | ChatMessageToolCall;

export type ChatMessageContent = string | ChatMessageContentPart[];

export type ChatMessage = {
  content: ChatMessageContent;
  role?: "user" | "assistant" | "system" | "tool";
};

export const flattenContentOfMessages = (
  messages: ChatMessage[] | Record<string, unknown> | string | undefined
): CoreMessage[] => {
  if (isString(messages) || isNumber(messages)) {
    return [
      {
        role: "user",
        content: String(messages),
      },
    ];
  }

  if (isArray(messages)) {
    return messages.map((message) => {
      if (isString(message) || isNumber(message)) {
        return {
          role: "user",
          content: String(message),
        } as CoreMessage;
      }

      if (typeof message === "object" && message !== null) {
        if ("content" in message) {
          const role = message.role || "user";

          if (typeof message.content === "string") {
            return {
              role,
              content: message.content,
            } as CoreMessage;
          }

          // Convert ChatMessageContentPart[] to AI SDK format
          const convertedContent = (message.content as ChatMessageContentPart[]).map((part) => {
            switch (part.type) {
              case "text":
                return {
                  type: "text" as const,
                  text: part.text,
                };
              case "image_url":
                return {
                  type: "image" as const,
                  image: part.url,
                };
              case "image":
                // Convert base64 data to data URL format
                const dataUrl = part.data.startsWith("data:")
                  ? part.data
                  : `data:${part.mediaType};base64,${part.data}`;
                return {
                  type: "image" as const,
                  image: dataUrl,
                };
              case "document_url":
                return {
                  type: "file" as const,
                  data: part.url,
                  mimeType: part.mediaType,
                };
              case "tool_call":
                return {
                  type: "tool-call" as const,
                  toolCallId: part.id || "",
                  toolName: part.name,
                  args: part.arguments || {},
                };
              default:
                // Fallback for unknown types
                return {
                  type: "text" as const,
                  text: JSON.stringify(part),
                };
            }
          });

          return {
            role,
            content: convertedContent,
          } as CoreMessage;
        }

        return {
          role: "user",
          content: JSON.stringify(message),
        } as CoreMessage;
      }

      return {
        role: "user",
        content: String(message),
      } as CoreMessage;
    });
  }

  return [
    {
      role: "user",
      content: JSON.stringify(messages),
    },
  ];
};

export type PaginatedResponse<T> = {
  items: T[];
  totalCount: number;
};

export const DownloadFormat = {
  JSON: "json",
  CSV: "csv",
} as const;

export type DownloadFormat = (typeof DownloadFormat)[keyof typeof DownloadFormat];

export interface ErrorEventAttributes {
  "exception.message": string;
  "exception.stacktrace": string;
  "exception.type": string;
}
