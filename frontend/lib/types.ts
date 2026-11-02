type ChatMessageText = {
  type: "text";
  text: string;
};

type ChatMessageImageUrl =
  | {
      type: "image_url";
      url: string;
      detail: string | null;
    }
  | {
      type: "image_url";
      image_url: {
        url: string;
        detail?: "low" | "medium" | "high";
      };
    };

type ChatMessageImage = {
  type: "image";
  mediaType: string; // e.g. "image/jpeg"
  data: string;
};

type ChatMessageDocumentUrl = {
  type: "document_url";
  mediaType: string; // e.g. "application/pdf"
  url: string;
};

type ChatMessageToolCall = {
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

type ChatMessageContent = string | ChatMessageContentPart[];

export type ChatMessage = {
  content: ChatMessageContent;
  role?: "user" | "assistant" | "system" | "tool";
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
