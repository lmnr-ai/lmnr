import { z } from "zod";

export const OpenAITextContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const OpenAIImageUrlContentSchema = z.object({
  type: z.literal("image_url"),
  image_url: z.object({
    url: z.string(),
    detail: z.enum(["low", "high", "auto"]).optional(),
  }),
});

export const OpenAIContentPartSchema = z.union([OpenAITextContentSchema, OpenAIImageUrlContentSchema]);

export const OpenAIContentSchema = z.union([z.string(), z.array(OpenAIContentPartSchema)]);

export const OpenAIFunctionSchema = z.object({
  name: z.string(),
  arguments: z.string().transform((str, ctx): Record<string, unknown> => {
    try {
      return JSON.parse(str);
    } catch (e) {
      ctx.addIssue({ code: "custom", message: "Invalid JSON in function arguments" });
      return {};
    }
  }),
});

// Tool call schema (simplified to focus on function calls)
export const OpenAIToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: OpenAIFunctionSchema,
});

export const OpenAISystemMessageSchema = z.object({
  role: z.literal("system"),
  content: z.string(),
  name: z.string().optional(),
});

// User message
export const OpenAIUserMessageSchema = z.object({
  role: z.literal("user"),
  content: OpenAIContentSchema,
  name: z.string().optional(),
});

// Assistant message (for conversation history)
export const OpenAIAssistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: z.union([z.string(), z.null()]).optional(),
  name: z.string().optional(),
  tool_calls: z.array(OpenAIToolCallSchema).optional(),
});

// Tool message (response to tool calls)
export const OpenAIToolMessageSchema = z.object({
  role: z.literal("tool"),
  content: z.string(),
  tool_call_id: z.string(),
});

export const OpenAIMessageSchema = z.union([
  OpenAISystemMessageSchema,
  OpenAIUserMessageSchema,
  OpenAIAssistantMessageSchema,
  OpenAIToolMessageSchema,
]);

export const OpenAIMessagesSchema = z.array(OpenAIMessageSchema);
