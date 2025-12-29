import { ModelMessage } from "ai";
import { isArray, isNumber, isString } from "lodash";

import { Message } from "@/lib/playground/types";
import { isStorageUrl, urlToBase64 } from "@/lib/s3";
import { ChatMessage, ChatMessageContentPart, ChatMessageImage } from "@/lib/types";

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
                      const imageUrl =
                        "image_url" in part && part.image_url ? part.image_url.url : "url" in part ? part.url : null;

                      if (!imageUrl) {
                        return part;
                      }

                      if (isStorageUrl(imageUrl)) {
                        const base64Image = await urlToBase64(imageUrl);
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

const processContentPart = (
  part: ChatMessageContentPart | any,
  store: Map<string, string>,
  role?: string,
  message?: any
): any => {
  switch (part.type) {
    case "text":
      return {
        type: "text" as const,
        text: part.text,
      };

    case "image_url":
      if ("image_url" in part) {
        return {
          type: "image" as const,
          image: part.image_url.url,
        };
      }
      return {
        type: "image" as const,
        image: part.url,
      };

    case "image": {
      const dataUrl = part.data.startsWith("data:") ? part.data : `data:${part.mediaType};base64,${part.data}`;
      return {
        type: "image" as const,
        image: dataUrl,
      };
    }

    case "document_url":
      return {
        type: "file" as const,
        data: part.url,
        mimeType: part.mediaType,
      };

    case "tool_call": {
      const toolCallId = part.id;
      const toolName = part.name;
      if (toolCallId) {
        store.set(toolCallId, toolName);
      }
      return {
        type: "tool-call" as const,
        toolCallId: toolCallId || "",
        toolName,
        input: part.arguments,
      };
    }

    default:
      if (role === "tool") {
        const toolCallId = part.toolCallId || message?.tool_call_id || "-";
        const toolName = store.get(toolCallId) || part.toolName || "-";
        return {
          type: "tool-result" as const,
          toolCallId,
          toolName,
          output: { type: "text", value: part.type === "text" ? part.text : JSON.stringify(part) },
        };
      }

      return {
        type: "text" as const,
        text: JSON.stringify(part),
      };
  }
};

const processMessageContent = (
  content: string | ChatMessageContentPart[] | any,
  store: Map<string, string>,
  role?: string,
  message?: any
): string | any[] => {
  if (role === "tool") {
    if (typeof content === "string") {
      return [
        {
          type: "tool-result" as const,
          toolCallId: message?.tool_call_id || "-",
          toolName: store.get(message?.tool_call_id) || "-",
          output: { type: "text", value: content },
        },
      ];
    }
    if (Array.isArray(content) && content.every((part) => part.type === "tool-result")) {
      return content;
    }
  }

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((part) => processContentPart(part, store, role, message));
  }

  return JSON.stringify(content);
};

export const convertToMessages = (
  messages: ChatMessage[] | Record<string, unknown> | string | undefined
): (Omit<ModelMessage, "role"> & { role?: ModelMessage["role"] })[] => {
  if (isString(messages) || isNumber(messages)) {
    return [
      {
        content: String(messages),
      },
    ];
  }

  if (isArray(messages)) {
    const store = new Map<string, string>();
    return messages.map((message) => {
      if (isString(message) || isNumber(message)) {
        return {
          content: String(message),
        } as ModelMessage;
      }

      if (typeof message === "object" && message !== null && "content" in message) {
        const role = message.role;
        const processedContent = processMessageContent(message.content, store, role, message);
        return {
          role: role,
          content: processedContent,
        };
      }
      return {
        content: JSON.stringify(message),
      } as ModelMessage;
    });
  }

  return [
    {
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
