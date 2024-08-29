export interface UserSession {
  id: string
  name: string
  email: string
  api_key: string
}

export type ChatMessageText = {
  type: 'text'
  text: string
}

export type ChatMessageImageUrl = {
  type: 'image_url'
  url: string
  detail: string | null
}

export type ChatMessageImage = {
  type: 'image'
  mediaType: string  // e.g. "image/jpeg"
  data: string
}

export type ChatMessageContentPart = ChatMessageText | ChatMessageImageUrl | ChatMessageImage;

export type ChatMessageContent = string | ChatMessageContentPart[];

export type ChatMessage = {
  content: string | ChatMessageContent
  role: 'user' | 'assistant' | 'system'
}

export type DatatableFilter = {
  column?: string;
  operator?: string;
  value?: string;
}