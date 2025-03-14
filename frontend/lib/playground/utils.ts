import { CoreMessage, CoreSystemMessage } from "ai";

import { ImagePart, Message, TextPart } from "@/lib/playground/types";
import { ChatMessage, ChatMessageImageUrl, ChatMessageText } from "@/lib/types";

export const mapMessages = async (messages: ChatMessage[]): Promise<Message[]> =>
  Promise.all(
    messages.map(async (message) => {
      if (typeof message.content === "string") {
        return {
          role: message.role,
          content: [{ type: "text", text: message.content }],
        };
      }

      const content: Array<ImagePart | TextPart> = await Promise.all(
        message.content.map(async (part) => {
          switch (part.type) {
            case "image":
              return {
                type: "image",
                image: part.data,
              };
            case "image_url":
            case "document_url":
              if (isStorageUrl(part.url)) {
                const base64Image = await urlToBase64(part.url);
                return {
                  type: "image",
                  image: base64Image,
                };
              }
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
        })
      );

      return {
        role: message.role,
        content,
      };
    })
  );

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

export const urlToBase64 = async (url: string): Promise<string> => {
  const response = await fetch(url);
  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();

  const base64 = Buffer.from(arrayBuffer).toString("base64");

  const mimeType = response.headers.get("content-type") || "image/jpeg";

  return `data:${mimeType};base64,${base64}`;
};

const isStorageUrl = (url: string) => {
  const storagePattern = /^\/api\/projects\/[^/]+\/payloads\/[^/]+$/;
  return storagePattern.test(url);
};
