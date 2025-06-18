import { CoreMessage } from "ai";
import { map } from "lodash";
import { z } from "zod";

import { Message } from "@/lib/playground/types";
import { isStorageUrl, urlToBase64 } from "@/lib/s3";

/** Part Schemas**/
export const OpenAITextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const OpenAIImagePartSchema = z.object({
  type: z.literal("image_url"),
  image_url: z.object({
    url: z.string(),
    detail: z.enum(["low", "high", "auto"]).optional(),
  }),
});

export const OpenAIFilePartSchema = z.object({
  file: z.object({
    file_data: z.string().optional(),
    file_id: z.string().optional(),
    filename: z.string().optional(),
  }),
  type: z.literal("file"),
});

export const OpenAIToolCallPartSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
});

/** Message Schemas**/
export const OpenAISystemMessageSchema = z.object({
  role: z.literal("system"),
  content: z.union([z.string(), OpenAITextPartSchema]),
  name: z.string().optional(),
});

export const OpenAIUserMessageSchema = z.object({
  role: z.literal("user"),
  content: z.union([z.string(), z.array(z.union([OpenAITextPartSchema, OpenAIImagePartSchema, OpenAIFilePartSchema]))]),
  name: z.string().optional(),
});

export const OpenAIAssistantMessageSchema = z.object({
  role: z.literal("assistant"),
  audio: z
    .object({
      id: z.string(),
    })
    .nullable()
    .optional(),
  function_call: z
    .object({
      arguments: z.string(),
      name: z.string(),
    })
    .nullable()
    .optional(),
  annotations: z.array(z.string()).nullable().optional(),
  refusal: z.string().nullable().optional(),
  content: z.union([z.string(), z.array(OpenAITextPartSchema)]).nullable(),
  name: z.string().optional(),
  tool_calls: z.array(OpenAIToolCallPartSchema).optional(),
});

export const OpenAIToolMessageSchema = z.object({
  role: z.literal("tool"),
  content: z.union([z.string(), z.array(OpenAITextPartSchema)]),
  tool_call_id: z.string(),
});

export const OpenAIMessageSchema = z.union([
  OpenAISystemMessageSchema,
  OpenAIUserMessageSchema,
  OpenAIAssistantMessageSchema,
  OpenAIToolMessageSchema,
]);

export const OpenAIMessagesSchema = z.array(OpenAIMessageSchema);

const convertOpenAIToChatMessages = (messages: z.infer<typeof OpenAIMessagesSchema>): CoreMessage[] => {
  const store = new Map();

  return map(messages, (message) => {
    switch (message.role) {
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
          content: message.content.map((part) => {
            if (part.type === "text") {
              return {
                type: "text" as const,
                text: part.text,
              };
            }
            if (part.type === "image_url") {
              return {
                type: "image" as const,
                image: part.image_url.url,
              };
            }

            return {
              type: "file" as const,
              data: String(part.file.file_data),
              mimeType: String(part.file.file_id),
            };
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
            ...(message.content || []).map((part) => ({
              type: "text" as const,
              text: part.text,
            })),
            ...(message.tool_calls || []).map((part) => {
              store.set(part.id, part.function.name);
              return {
                type: "tool-call" as const,
                toolCallId: part.id,
                toolName: part.function.name,
                args: part.function.arguments,
              };
            }),
          ],
        };

      case "tool":
        return {
          role: message.role,
          content: [
            {
              type: "tool-result" as const,
              toolCallId: message.tool_call_id,
              toolName: store.get(message.tool_call_id) || message.tool_call_id,
              result: message.content,
            },
          ],
        };
    }
  });
};

export const downloadOpenAIImages = async (
  messages: z.infer<typeof OpenAIMessagesSchema>
): Promise<z.infer<typeof OpenAIMessagesSchema>> =>
  Promise.all(
    messages.map(async (message) => {
      if (message.role === "user" && Array.isArray(message.content)) {
        const processedContent = await Promise.all(
          message.content.map(async (part) => {
            if (part.type === "image_url") {
              const url = part.image_url.url;
              try {
                if (isStorageUrl(url)) {
                  const base64Image = await urlToBase64(url);
                  return {
                    ...part,
                    image_url: {
                      ...part.image_url,
                      url: base64Image,
                    },
                  };
                }
                return part;
              } catch (error) {
                console.error("Error processing image part:", error);
                return {
                  type: "text" as const,
                  text: `[Image processing failed: ${part.image_url.url}]`,
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

export const convertOpenAIToPlaygroundMessages = async (
  messages: z.infer<typeof OpenAIMessagesSchema>
): Promise<Message[]> => {
  const convertedImagesMessages = await downloadOpenAIImages(messages);
  return convertOpenAIToChatMessages(convertedImagesMessages).map((message) => {
    if (typeof message.content === "string") {
      return {
        ...message,
        content: [{ type: "text" as const, text: message.content }],
      } as Message;
    }
    return message as Message;
  });
};
