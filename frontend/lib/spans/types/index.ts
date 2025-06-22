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

export const convertToMessages = (
  messages: ChatMessage[] | Record<string, unknown> | string | undefined
): (Omit<CoreMessage, "role"> & { role?: CoreMessage["role"] })[] => {
  if (isString(messages) || isNumber(messages)) {
    return [
      {
        content: String(messages),
      },
    ];
  }

  if (isArray(messages)) {
    // Create a store for tool call ID to tool name mapping, similar to OpenAI conversion
    const store = new Map<string, string>();

    return messages.map((message) => {
      if (isString(message) || isNumber(message)) {
        return {
          content: String(message),
        } as CoreMessage;
      }

      if (typeof message === "object" && message !== null && "content" in message) {
        const role = message.role;

        switch (role) {
          case "system":
            return {
              role: message.role,
              content: typeof message.content === "string" ? message.content : JSON.stringify(message.content),
            };

          case "user":
            if (typeof message.content === "string") {
              return {
                role: message.role,
                content: message.content,
              };
            }

            return {
              role: message.role,
              content: (message.content as ChatMessageContentPart[]).map((part) => {
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
                  default:
                    return {
                      type: "text" as const,
                      text: JSON.stringify(part),
                    };
                }
              }),
            };

          case "assistant":
            if (typeof message.content === "string") {
              return {
                role: message.role,
                content: message.content,
              };
            }

            return {
              role: message.role,
              content: [
                ...(message.content || [])
                  .filter((part: any) => part.type === "text")
                  .map((part: any) => ({
                    type: "text" as const,
                    text: part.text,
                  })),
                ...(message.content || [])
                  .filter((part: any) => part.type === "tool_call")
                  .map((part: any) => {
                    const toolCallId = part.id;
                    const toolName = part.name;
                    if (toolCallId) {
                      store.set(toolCallId, toolName);
                    }

                    return {
                      type: "tool-call" as const,
                      toolCallId: toolCallId || "",
                      toolName,
                      args: typeof part.arguments === "string" ? part.arguments : JSON.stringify(part.arguments || {}),
                    };
                  }),
              ],
            };

          case "tool":
            // Tool messages must always have content as an array of ToolResultPart
            if (typeof message.content === "string") {
              return {
                role: message.role,
                content: [
                  {
                    type: "tool-result" as const,
                    toolCallId: (message as any).tool_call_id || "-",
                    toolName: store.get((message as any).tool_call_id) || "-",
                    result: message.content,
                  },
                ],
              };
            }

            return {
              role: message.role,
              content: (message.content as ChatMessageContentPart[]).map((part) => {
                const toolCallId = (part as any).toolCallId || (message as any).tool_call_id || "-";
                const toolName = store.get(toolCallId) || (part as any).toolName || "-";

                return {
                  type: "tool-result" as const,
                  toolCallId,
                  toolName,
                  result: part.type === "text" ? part.text : JSON.stringify(part),
                };
              }),
            };

          default:
            if (typeof message.content === "string") {
              return {
                role,
                content: message.content,
              };
            }

            return {
              role,
              content: (message.content as ChatMessageContentPart[]).map((part) => ({
                type: "text" as const,
                text: JSON.stringify(part),
              })),
            };
        }
      }

      return {
        content: JSON.stringify(message),
      } as CoreMessage;
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
