import { CoreMessage, CoreSystemMessage } from "ai";

import { ImagePart, Message, TextPart } from "@/lib/playground/types";
import { ChatMessage, ChatMessageImageUrl, ChatMessageText } from "@/lib/types";

export const mapMessages = (messages: ChatMessage[]): Message[] =>
  messages.map((message) => {
    if (typeof message.content === "string") {
      return {
        role: message.role,
        content: [{ type: "text", text: message.content }],
      };
    }

    const content: Array<ImagePart | TextPart> = message.content.map((part) => {
      switch (part.type) {
        case "image":
          return {
            type: "image",
            image: part.data,
          };
        case "image_url":
        case "document_url":
          return {
            type: "image",
            image: part.url,
          };
        default:
          return {
            type: "text",
            text: part.text,
          };
      }
    });

    return {
      role: message.role,
      content,
    };
  });

export const remapMessages = (messages: Message[]): ChatMessage[] =>
  messages.map((message) => ({
    role: message.role,
    content: message.content.map((part) => {
      switch (part.type) {
        case "text":
          return part as ChatMessageText;
        default:
          return {
            type: "image_url",
            url: part.image,
            detail: null,
          } as ChatMessageImageUrl;
      }
    }),
  }));

export const parseSystemMessages = (messages: Message[]): CoreMessage[] =>
  messages.map((message) => {
    if (message.role === "system" && message.content?.[0]?.type === "text") {
      return {
        role: message.role,
        content: message.content?.[0]?.text,
      } as CoreSystemMessage;
    }
    return message as CoreMessage;
  });
