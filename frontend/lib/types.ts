export interface UserSession {
  id: string;
  name: string;
  email: string;
  api_key: string;
}

export type ChatMessageText = {
  type: 'text';
  text: string;
};

export type ChatMessageImageUrl = {
  type: 'image_url';
  url: string;
  detail: string | null;
};

export type ChatMessageImage = {
  type: 'image';
  mediaType: string; // e.g. "image/jpeg"
  data: string;
};

export type ChatMessageContentPart =
  | ChatMessageText
  | ChatMessageImageUrl
  | ChatMessageImage;

export type ChatMessageContent = string | ChatMessageContentPart[];

export type ChatMessage = {
  content: ChatMessageContent;
  role: 'user' | 'assistant' | 'system';
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
