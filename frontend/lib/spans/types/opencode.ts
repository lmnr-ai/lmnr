import { type ModelMessage } from "ai";
import { z } from "zod/v4";

import { type Message } from "@/lib/playground/types";
import {
  type AiSdkMessage,
  convertAiSdkToPlaygroundMessages,
  maybeParseStringifiedParts,
} from "@/lib/spans/types/ai-sdk";

// OpenCode V2 `LLM.Message`, sent by `@lmnr-ai/opencode-plugin`.
const ToolCallPartSchema = z.object({
  type: z.literal("tool-call"),
  id: z.string(),
  name: z.string(),
  input: z.unknown(),
});

const ToolResultPartSchema = z.object({
  type: z.literal("tool-result"),
  id: z.string(),
  name: z.string(),
  result: z.object({ type: z.enum(["json", "text", "error", "content"]), value: z.unknown() }),
});

const MediaPartSchema = z.object({
  type: z.literal("media"),
  media: z.object({
    source: z.object({
      type: z.string(),
      data: z.string().optional(),
      url: z.string().optional(),
      mediaType: z.string(),
    }),
  }),
});

const OpenCodeMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.array(
    z.union([
      z.object({ type: z.enum(["text", "reasoning"]), text: z.string() }),
      ToolCallPartSchema,
      ToolResultPartSchema,
      MediaPartSchema,
      z.object({ type: z.string() }).loose(),
    ])
  ),
});

export type OpenCodeMessage = z.infer<typeof OpenCodeMessageSchema>;
type GenericMessage = Omit<ModelMessage, "role"> & { role?: ModelMessage["role"] };

// Parts no other format emits; AI SDK tool calls use `toolCallId` instead of `id`.
const isOpenCodePart = (part: { type?: string; id?: unknown; result?: unknown; media?: { source?: unknown } }) =>
  (part?.type === "tool-call" && typeof part.id === "string") ||
  (part?.type === "tool-result" && part.result !== undefined) ||
  (part?.type === "media" && part.media?.source !== undefined);

export const matchOpenCodeMessages = (data: unknown): OpenCodeMessage[] | null => {
  if (!Array.isArray(data)) return null;
  // Ingestion stringifies content with parts it doesn't know (`input_chat_messages_from_json`).
  const messages = data.map((m) => ({ ...m, content: maybeParseStringifiedParts(m?.content) }));
  if (!messages.some((m) => Array.isArray(m.content) && m.content.some(isOpenCodePart))) return null;
  const result = z.array(OpenCodeMessageSchema).safeParse(messages);
  return result.success ? result.data : null;
};

const convertPart = (part: OpenCodeMessage["content"][number]): unknown => {
  switch (part.type) {
    case "tool-call": {
      const p = part as z.infer<typeof ToolCallPartSchema>;
      return { type: "tool-call", toolCallId: p.id, toolName: p.name, input: p.input };
    }
    case "tool-result": {
      const { id, name, result } = part as z.infer<typeof ToolResultPartSchema>;
      const type = result.type === "error" ? "error-json" : result.type;
      return { type: "tool-result", toolCallId: id, toolName: name, output: { type, value: result.value } };
    }
    case "media": {
      const { source } = (part as z.infer<typeof MediaPartSchema>).media;
      const src = source.url ?? `data:${source.mediaType};base64,${source.data}`;
      return source.mediaType.startsWith("image/")
        ? { type: "image", image: src }
        : { type: "file", data: src, mediaType: source.mediaType };
    }
    default:
      return part;
  }
};

const convertOne = (message: OpenCodeMessage): GenericMessage =>
  ({ role: message.role, content: message.content.map(convertPart) }) as GenericMessage;

export const parseOpenCodeMessages = (data: unknown): GenericMessage[] | null =>
  matchOpenCodeMessages(data)?.map(convertOne) ?? null;

export const convertOpenCodeToPlaygroundMessages = (messages: OpenCodeMessage[]): Promise<Message[]> =>
  convertAiSdkToPlaygroundMessages(messages.map(convertOne) as AiSdkMessage[]);
