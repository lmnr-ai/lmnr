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
  role: "user" | "assistant" | "system";
};

export function flattenChatMessages(
  messages: ChatMessage[]
): (ChatMessageContentPart & { role?: ChatMessage["role"] })[] {
  return messages.flatMap((message, index) => {
    // If content is a string, convert it to a text content part
    if (typeof message.content === "string") {
      return [
        {
          type: "text",
          text: message.content,
          role: index === 0 ? message.role : undefined,
        },
      ];
    }

    // If content is already an array of content parts, return it as is
    return message.content.map((content) => ({ ...content, role: index === 0 ? message.role : undefined }));
  });
}

export const flattenContentOfMessages = (
  messages: ChatMessage[]
): {
  content: ChatMessageContentPart[];
  role: "user" | "assistant" | "system";
}[] =>
  messages.map((message) => {
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
