import { isArray, isString } from "lodash";

export interface UserSession {
  id: string;
  name: string;
  email: string;
  api_key: string;
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

export type OpenAIImageUrl = {
  type: "image_url";
  image_url: {
    url: string;
    detail: string | null;
  };
};

export type ChatMessageContentPart = ChatMessageText | ChatMessageImageUrl | ChatMessageImage | ChatMessageDocumentUrl;

export type ChatMessageContent = string | ChatMessageContentPart[];

export type ChatMessage = {
  content: ChatMessageContent;
  role?: "user" | "assistant" | "system";
};

export const flattenContentOfMessages = (
  messages: ChatMessage[] | Record<string, unknown> | string
): {
  content: ChatMessageContentPart[];
  role?: "user" | "assistant" | "system";
}[] => {
  if (isString(messages)) {
    return [{ content: [{ type: "text", text: messages }] }];
  }

  if (isArray(messages)) {
    return messages.map((message) => {
      if (typeof message.content === "string") {
        return {
          ...message,
          content: [{ type: "text", text: message.content }],
        };
      }

      return message as {
        content: ChatMessageContentPart[];
        role: "user" | "assistant" | "system";
      };
    });
  }

  return [{ content: [{ type: "text", text: JSON.stringify(messages) }] }];
};

export type DatatableFilter = {
  column: string;
  operator: string;
  value: string;
};

export type PaginatedResponse<T> = {
  items: T[];
  totalCount: number;
};

export type PaginatedGetResponseWithProjectPresenceFlag<T> = PaginatedResponse<T> & {
  anyInProject: boolean;
};

export type BucketRow = {
  lowerBound: number;
  upperBound: number;
  heights: number[];
};

export const DownloadFormat = {
  JSON: "json",
  CSV: "csv",
} as const;

export type DownloadFormat = (typeof DownloadFormat)[keyof typeof DownloadFormat];
