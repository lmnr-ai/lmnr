import { map } from "lodash";
import { z } from "zod/v4";

import { type Message } from "@/lib/playground/types";
import { isStorageUrl, urlToBase64 } from "@/lib/s3";

/** Content Block Schemas **/

export const AnthropicTextBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const AnthropicThinkingBlockSchema = z.object({
  type: z.literal("thinking"),
  thinking: z.string(),
});

export const AnthropicToolUseBlockSchema = z.object({
  type: z.literal("tool_use"),
  id: z.string(),
  name: z.string(),
  input: z.unknown(),
});

export const AnthropicToolResultBlockSchema = z.object({
  type: z.literal("tool_result"),
  tool_use_id: z.string(),
  content: z.union([z.string(), z.array(z.unknown())]).optional(),
  is_error: z.boolean().optional(),
});

export const AnthropicImageBase64SourceSchema = z.object({
  type: z.literal("base64"),
  media_type: z.string(),
  data: z.string(),
});

export const AnthropicImageUrlSourceSchema = z.object({
  type: z.literal("url"),
  url: z.string(),
});

export const AnthropicImageBlockSchema = z.object({
  type: z.literal("image"),
  source: z.union([AnthropicImageBase64SourceSchema, AnthropicImageUrlSourceSchema]),
});

export const AnthropicContentBlockSchema = z.union([
  AnthropicTextBlockSchema,
  AnthropicThinkingBlockSchema,
  AnthropicToolUseBlockSchema,
  AnthropicToolResultBlockSchema,
  AnthropicImageBlockSchema,
]);

/** Message Schemas **/

export const AnthropicMessageSchema = z
  .object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.union([z.string(), z.array(AnthropicContentBlockSchema)]),
  })
  .passthrough();

export const AnthropicMessagesSchema = z.array(AnthropicMessageSchema);

/** Output format — wraps content blocks with metadata **/

export const AnthropicOutputMessageSchema = z
  .object({
    role: z.string().optional(),
    content: z.array(AnthropicContentBlockSchema),
    stop_reason: z.string().optional(),
  })
  .passthrough();

export const AnthropicOutputMessagesSchema = z.array(AnthropicOutputMessageSchema);

/** Parse helpers — validate + normalise **/

/**
 * Try to parse `data` as Anthropic input messages.
 * Returns null on mismatch.
 */
export const parseAnthropicInput = (data: unknown): z.infer<typeof AnthropicMessagesSchema> | null => {
  // Single message
  const single = AnthropicMessageSchema.safeParse(data);
  if (single.success) return [single.data];

  // Array of messages
  const multi = AnthropicMessagesSchema.safeParse(data);
  if (multi.success) return multi.data;

  return null;
};

/**
 * Try to parse `data` as Anthropic output.
 * Output is an array of candidates, each containing content blocks.
 * Returns the messages array (one per candidate) for rendering.
 */
export const parseAnthropicOutput = (data: unknown): z.infer<typeof AnthropicMessagesSchema> | null => {
  // Single output message
  const single = AnthropicOutputMessageSchema.safeParse(data);
  if (single.success) {
    return [
      {
        role: (single.data.role as "user" | "assistant" | "system") || "assistant",
        content: single.data.content,
      },
    ];
  }

  // Array of output messages
  const multi = AnthropicOutputMessagesSchema.safeParse(data);
  if (multi.success) {
    return multi.data.map((m) => ({
      role: (m.role as "user" | "assistant" | "system") || "assistant",
      content: m.content,
    }));
  }

  return null;
};

/** Extract system message from Anthropic messages */
export const extractAnthropicSystemMessage = (messages: z.infer<typeof AnthropicMessagesSchema>): string | null => {
  const system = messages.find((m) => m.role === "system");
  if (!system) return null;

  if (typeof system.content === "string") return system.content;

  const textParts = (system.content as z.infer<typeof AnthropicContentBlockSchema>[])
    .filter((b): b is z.infer<typeof AnthropicTextBlockSchema> => "type" in b && b.type === "text")
    .map((b) => b.text);

  return textParts.length > 0 ? textParts.join("\n") : null;
};

/** Conversion to Playground format **/

export const convertAnthropicToPlaygroundMessages = async (
  messages: z.infer<typeof AnthropicMessagesSchema>
): Promise<Message[]> => {
  const toolNameById = new Map<string, string>();
  for (const message of messages) {
    if (typeof message.content !== "string") {
      for (const block of message.content) {
        if (block.type === "tool_use") {
          toolNameById.set(block.id, block.name);
        }
      }
    }
  }

  return Promise.all(
    map(messages, async (message): Promise<Message> => {
      const content: Message["content"] = [];

      if (typeof message.content === "string") {
        content.push({ type: "text", text: message.content });
      } else {
        for (const block of message.content) {
          switch (block.type) {
            case "text":
              content.push({ type: "text", text: block.text });
              break;

            case "thinking":
              content.push({ type: "text", text: `[Thinking]\n${block.thinking}` });
              break;

            case "tool_use":
              content.push({
                type: "tool-call",
                toolCallId: block.id,
                toolName: block.name,
                input: { type: "json", value: JSON.stringify(block.input ?? {}) },
              });
              break;

            case "tool_result": {
              const resultContent =
                typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? "");
              content.push({
                type: "tool-result",
                toolCallId: block.tool_use_id,
                toolName: toolNameById.get(block.tool_use_id) || block.tool_use_id,
                output: { type: "text", value: resultContent },
              });
              break;
            }

            case "image": {
              if (block.source.type === "base64") {
                const src = `data:${block.source.media_type};base64,${block.source.data}`;
                content.push({ type: "image", image: src });
              } else {
                let imageData = block.source.url;
                if (isStorageUrl(imageData)) {
                  try {
                    imageData = await urlToBase64(imageData);
                  } catch (error) {
                    console.error("Error downloading Anthropic image:", error);
                  }
                }
                content.push({ type: "image", image: imageData });
              }
              break;
            }
          }
        }
      }

      return { role: message.role, content };
    })
  );
};
