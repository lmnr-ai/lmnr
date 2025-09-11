import { ModelMessage } from "ai";
import { map } from "lodash";
import { z } from "zod/v4";

import { Message } from "@/lib/playground/types";
import { isStorageUrl, urlToBase64 } from "@/lib/s3";

/** Complex Content Block **/
export const LangChainTextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const LangChainImageUrlPartSchema = z.object({
  type: z.literal("image_url"),
  image_url: z.union([z.string(), z.object({ url: z.string(), detail: z.enum(["low", "high", "auto"]) })]),
});

const LangChainComplexPartSchema = z.union([LangChainTextPartSchema, LangChainImageUrlPartSchema]);

/** Data Content Block **/
export const LangChainBase64PartSchema = z.object({
  type: z.enum(["image", "audio", "file"]),
  data: z.string(),
  source_type: z.literal("base64"),
  mime_type: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const LangChainURLPartSchema = z.object({
  type: z.enum(["image", "audio", "file"]),
  source_type: z.literal("url"),
  url: z.string(),
  mime_type: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const LangChainPlainTextPartSchema = z.object({
  type: z.enum(["file", "text"]),
  source_type: z.literal("text"),
  text: z.string(),
  mime_type: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const LangChainIDPartSchema = z.object({
  id: z.string(),
  source_type: z.literal("id"),
  type: z.enum(["image", "audio", "file"]),
  mime_type: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const LangChainDataPartSchema = z.union([
  LangChainBase64PartSchema,
  LangChainURLPartSchema,
  LangChainPlainTextPartSchema,
  LangChainIDPartSchema,
]);

/** Content Block **/
export const LangChainContentPartSchema = z.union([
  z.string(),
  z.array(z.union([LangChainDataPartSchema, LangChainComplexPartSchema])),
]);

/** Tool Call Block **/
export const LangChainToolCallPartSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.any()),
  id: z.string().optional(),
  type: z.literal("tool_call").optional(),
});

export const LangChainInvalidToolCallPartSchema = z.object({
  name: z.string().optional(),
  args: z.string().optional(),
  id: z.string().optional(),
  error: z.string().optional(),
  type: z.literal("invalid_tool_call").optional(),
});

/** Messages **/
export const LangChainSystemMessageSchema = z.object({
  role: z.literal("system"),
  content: LangChainContentPartSchema,
});

export const LangChainToolMessageSchema = z.object({
  role: z.literal("tool"),
  content: LangChainContentPartSchema.nullable(),
  tool_call_id: z.string(),
});

export const LangChainUserMessageSchema = z.object({
  role: z.enum(["human", "user"]),
  content: LangChainContentPartSchema,
});

export const LangChainAssistantMessageSchema = z.object({
  role: z.enum(["assistant", "ai"]),
  content: LangChainContentPartSchema.nullable(),
  tool_calls: z.array(LangChainToolCallPartSchema).optional(),
  invalid_tool_calls: z.array(LangChainInvalidToolCallPartSchema).optional(),
  usage_metadata: z.record(z.string(), z.unknown()).optional(),
});

export const LangChainMessageSchema = z.union([
  LangChainSystemMessageSchema,
  LangChainToolMessageSchema,
  LangChainUserMessageSchema,
  LangChainAssistantMessageSchema,
]);

export const LangChainMessagesSchema = z.array(LangChainMessageSchema);

const convertLangChainToChatMessages = (messages: z.infer<typeof LangChainMessagesSchema>): ModelMessage[] => {
  const store = new Map();

  return map(messages, (message) => {
    switch (message.role) {
      case "system":
        return {
          role: message.role,
          content: typeof message.content === "string" ? message.content : JSON.stringify(message.content),
        };

      case "human":
      case "user":
        if (typeof message.content === "string") {
          return {
            role: "user" as const,
            content: message.content,
          };
        }

        return {
          role: "user" as const,
          content: message.content.map((part) => {
            if ("type" in part && part.type === "text") {
              return {
                type: "text" as const,
                text: part.text,
              };
            }
            if ("type" in part && part.type === "image_url") {
              const imageUrl = typeof part.image_url === "string" ? part.image_url : part.image_url.url;
              return {
                type: "image" as const,
                image: imageUrl,
              };
            }

            if ("source_type" in part) {
              switch (part.source_type) {
                case "base64":
                  if (part.type === "image") {
                    return {
                      type: "image" as const,
                      image: `data:${part.mime_type || "image/jpeg"};base64,${part.data}`,
                    };
                  }
                  return {
                    type: "file" as const,
                    data: part.data,
                    mimeType: part.mime_type || "application/octet-stream",
                    mediaType: "base64",
                  };
                case "url":
                  if (part.type === "image") {
                    return {
                      type: "image" as const,
                      image: part.url,
                    };
                  }
                  return {
                    type: "file" as const,
                    data: part.url,
                    mimeType: part.mime_type || "application/octet-stream",
                    mediaType: "url",
                  };
                case "text":
                  return {
                    type: "text" as const,
                    text: part.text,
                  };
                case "id":
                  return {
                    type: "file" as const,
                    data: part.id,
                    mimeType: part.mime_type || "application/octet-stream",
                    mediaType: part.source_type,
                  };
              }
            }

            return {
              type: "text" as const,
              text: JSON.stringify(part),
            };
          }),
        };

      case "assistant":
      case "ai":
        if (typeof message.content === "string") {
          return {
            role: "assistant" as const,
            content: message.content,
          };
        }

        return {
          role: "assistant" as const,
          content: [
            ...(Array.isArray(message.content) ? message.content : []).map((part) => {
              if ("type" in part && part.type === "text") {
                return {
                  type: "text" as const,
                  text: part.text,
                };
              }
              if ("source_type" in part && part.source_type === "text") {
                return {
                  type: "text" as const,
                  text: part.text,
                };
              }
              return {
                type: "text" as const,
                text: JSON.stringify(part),
              };
            }),
            ...(message.tool_calls || []).map((toolCall) => {
              const id = toolCall.id || Math.random().toString(36).substring(7);
              store.set(id, toolCall.name);
              return {
                type: "tool-call" as const,
                toolCallId: id,
                toolName: toolCall.name,
                input: { type: "json", value: JSON.stringify(toolCall.arguments) },
              };
            }),
          ],
        };

      case "tool":
        const toolCallId = message.tool_call_id;
        return {
          role: message.role,
          content: [
            {
              type: "tool-result" as const,
              toolCallId: toolCallId || "-",
              toolName: store.get(toolCallId) || toolCallId,
              output:
                typeof message.content === "string"
                  ? { type: "text", value: message.content }
                  : { type: "content", value: [] },
            },
          ],
        };
    }
  });
};

export const downloadLangChainImages = async (
  messages: z.infer<typeof LangChainMessagesSchema>
): Promise<z.infer<typeof LangChainMessagesSchema>> =>
  Promise.all(
    messages.map(async (message) => {
      if ((message.role === "human" || message.role === "user") && Array.isArray(message.content)) {
        const processedContent = await Promise.all(
          message.content.map(async (part) => {
            if ("type" in part && part.type === "image_url") {
              const imageUrl = typeof part.image_url === "string" ? part.image_url : part.image_url.url;
              try {
                if (isStorageUrl(imageUrl)) {
                  const base64Image = await urlToBase64(imageUrl);
                  return {
                    ...part,
                    image_url:
                      typeof part.image_url === "string" ? base64Image : { ...part.image_url, url: base64Image },
                  };
                }
                return part;
              } catch (error) {
                console.error("Error processing image part:", error);
                return {
                  type: "text" as const,
                  text: `[Image processing failed: ${imageUrl}]`,
                };
              }
            }

            if ("source_type" in part && part.source_type === "url" && part.type === "image") {
              try {
                if (isStorageUrl(part.url)) {
                  const base64Image = await urlToBase64(part.url);
                  return {
                    ...part,
                    source_type: "base64" as const,
                    data: base64Image.split(",")[1],
                    mime_type: part.mime_type || "image/jpeg",
                  };
                }
                return part;
              } catch (error) {
                console.error("Error processing image part:", error);
                return {
                  type: "text" as const,
                  source_type: "text" as const,
                  text: `[Image processing failed: ${part.url}]`,
                };
              }
            }

            return part;
          })
        );

        return { ...message, content: processedContent };
      }

      return message;
    })
  );

export const convertLangChainToPlaygroundMessages = async (
  messages: z.infer<typeof LangChainMessagesSchema>
): Promise<Message[]> => {
  const convertedImagesMessages = await downloadLangChainImages(messages);
  return convertLangChainToChatMessages(convertedImagesMessages).map((message) => {
    if (typeof message.content === "string") {
      return {
        ...message,
        content: [{ type: "text" as const, text: message.content }],
      } as Message;
    }
    return message as Message;
  });
};
