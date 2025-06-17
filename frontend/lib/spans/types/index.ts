import { CoreMessage } from "ai";
import { isArray, isNumber, isString } from "lodash";

import { Message } from "@/lib/playground/types";
import { isStorageUrl, urlToBase64 } from "@/lib/s3";
import { ChatMessage, ChatMessageContentPart, ChatMessageImage } from "@/lib/types";

export * from "./openai";

/**
 * Downloads images of internal messages format
 */
export const downloadImages = async (
  messages: ChatMessage[] | Record<string, unknown> | string | undefined
): Promise<ChatMessage[] | Record<string, unknown> | string | undefined> => {
  if (isString(messages) || isNumber(messages)) {
    return messages;
  }

  if (isArray(messages)) {
    return Promise.all(
      messages.map(async (message) => {
        if (isString(message) || isNumber(message)) {
          return message;
        }
        if (typeof message === "object" && message !== null) {
          if ("content" in message && Array.isArray(message.content)) {
            const processedContent = await Promise.all(
              (message.content as ChatMessageContentPart[]).map(async (part) => {
                switch (part.type) {
                  case "image_url":
                    try {
                      if (isStorageUrl(part.url)) {
                        const base64Image = await urlToBase64(part.url);
                        return {
                          type: "image" as const,
                          mediaType: "image/png",
                          data: base64Image.split(",")[1] || base64Image,
                        } as ChatMessageImage;
                      }
                      return part;
                    } catch (error) {
                      console.error("Error downloading image:", error);
                      return part;
                    }
                  default:
                    return part;
                }
              })
            );
            return {
              ...message,
              content: processedContent,
            } as ChatMessage;
          }

          return message as ChatMessage;
        }

        return message;
      })
    );
  }

  return messages;
};

export const convertToMessages = (
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

export const convertToPlaygroundMessages = async (messages: ChatMessage[]): Promise<Message[]> => {
  const processedImages = await downloadImages(messages);

  return convertToMessages(processedImages).map((message) => {
    if (typeof message.content === "string") {
      return {
        ...message,
        content: [{ type: "text" as const, text: message.content }],
      } as Message;
    }
    return message as Message;
  });
};
