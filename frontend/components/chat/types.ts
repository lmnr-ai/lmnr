type ChatMessageContent = string | Array<ChatMessageTextPart | ChatMessageImagePart>;

interface ChatMessageTextPart {
  text: string;
}

type ChatMessageImagePart = ChatMessageImageUrlPart | ChatMessageImageBase64Part;

interface ChatMessageImageUrlPart {
  imageUrl: string;
}

interface ChatMessageImageBase64Part {
  imageB64: string;
}

type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  // required?
  id?: string;
  role: Role;
  name?: string;
  toolCallId?: string;
  isStateMessage: boolean;
  content: ChatMessageContent;
}
