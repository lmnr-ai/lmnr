import { type ModelMessage } from "ai";
import { map } from "lodash";
import { z } from "zod/v4";

import { type Message } from "@/lib/playground/types";
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
  content: z.union([z.string(), z.array(OpenAITextPartSchema)]),
  name: z.string().optional(),
});

export const OpenAIUserMessageSchema = z.object({
  role: z.literal("user"),
  content: z.union([z.string(), z.array(z.union([OpenAITextPartSchema, OpenAIImagePartSchema, OpenAIFilePartSchema]))]),
  name: z.string().optional(),
});

// Temporary. TODO: update, once the instrumentations and backend fully support OpenAI responses API types.
export const OpenAIComputerCallOutputMessageSchema = z.object({
  role: z.literal("computer_call_output"),
  content: z.array(z.union([OpenAIImagePartSchema, OpenAIFilePartSchema])),
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
  tool_calls: z.array(OpenAIToolCallPartSchema).nullable().optional(),
});

export const OpenAIToolMessageSchema = z.object({
  role: z.literal("tool"),
  content: z.union([z.string(), z.array(OpenAITextPartSchema)]),
  // FIXME: temporary patch
  tool_call_id: z.string().optional(),
});

export const OpenAIMessageSchema = z.union([
  OpenAISystemMessageSchema,
  OpenAIUserMessageSchema,
  OpenAIAssistantMessageSchema,
  OpenAIToolMessageSchema,
  OpenAIComputerCallOutputMessageSchema,
]);

export const OpenAIMessagesSchema = z.array(OpenAIMessageSchema);


/** Choice Schema (output format) **/

// A Choice wraps a Message with generation metadata.
// See: https://platform.openai.com/docs/api-reference/chat/object
export const OpenAIChoiceSchema = z
  .object({
    message: OpenAIMessageSchema,
    finish_reason: z.string().nullable().optional(),
    index: z.number().optional(),
    logprobs: z.unknown().nullable().optional(),
  })
  .passthrough();

export const OpenAIChoicesSchema = z.array(OpenAIChoiceSchema);

/** High-level input / output schemas **/

export const OpenAIInputSchema = z.union([OpenAIMessageSchema, OpenAIMessagesSchema]);
export const OpenAIOutputSchema = z.union([OpenAIChoiceSchema, OpenAIChoicesSchema]);

/** Parse helpers — validate + normalise into a Messages array **/

/** Try to parse `data` as OpenAI input (Message or Message[]). Returns null on mismatch. */
export const parseOpenAIInput = (data: unknown): z.infer<typeof OpenAIMessagesSchema> | null => {
  const result = OpenAIInputSchema.safeParse(data);
  if (!result.success) return null;
  return Array.isArray(result.data) ? result.data : [result.data];
};

/** Try to parse `data` as OpenAI output (Choice or Choice[]). Returns null on mismatch. */
export const parseOpenAIOutput = (data: unknown): z.infer<typeof OpenAIMessagesSchema> | null => {
  const result = OpenAIOutputSchema.safeParse(data);
  if (!result.success) return null;
  const choices = Array.isArray(result.data) ? result.data : [result.data];
  return choices.map((c) => c.message);
};


const convertOpenAIToChatMessages = (messages: z.infer<typeof OpenAIMessagesSchema>): ModelMessage[] => {
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
              mediaType: String(part.file.file_id),
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
                input: { type: "json", value: part.function.arguments },
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
              // FIXME: temporary patch
              toolCallId: String(message?.tool_call_id || "-"),
              toolName: store.get(message.tool_call_id) || message.tool_call_id,
              output:
                typeof message.content === "string"
                  ? { type: "text", value: message.content }
                  : { type: "content", value: message.content },
            },
          ],
        };

      case "computer_call_output":
        return {
          role: "user",
          content: message.content.map((part) => {
            if (part.type === "image_url") {
              return {
                type: "image" as const,
                image: part.image_url.url,
              };
            }

            return {
              type: "file" as const,
              data: String(part.file.file_data),
              mediaType: String(part.file.file_id),
            };
          }),
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
