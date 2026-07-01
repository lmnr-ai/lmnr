import { type ModelMessage } from "ai";
import { z } from "zod/v4";

/**
 * Native Vercel AI SDK v7 `ModelMessage` shape.
 *
 * The `@lmnr-ai/lmnr` AI-SDK-v7 instrumentation serializes the request prompt
 * (`ai.prompt.messages` / `lmnr.span.input`) as a raw `ModelMessage[]` — an
 * array of `{ role, content }` where `content` is a string or an array of
 * content parts using AI SDK's *dash-style* discriminators (`tool-call`,
 * `tool-result`, `reasoning`, ...). None of the provider-native detectors
 * (OpenAI/Anthropic/Gemini/LangChain/GenAI) recognise this shape, so it would
 * otherwise fall through to the lossy generic `convertToMessages`, which only
 * knows the underscore-style `tool_call` and stringifies `tool-call` /
 * `reasoning` parts into raw JSON text.
 *
 * This detector claims native AI-SDK arrays and maps them onto the generic
 * `ModelMessage` shape the `ContentParts` renderer already handles. Exotic v7
 * parts (`custom`, `reasoning-file`, `tool-approval-request/response`) pass
 * through verbatim so the generic renderer's JSON fallback surfaces them.
 *
 * Spec: https://ai-sdk.dev/docs/reference/ai-sdk-core/model-message
 */

const AiSdkTextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

// `.loose()` keeps provider metadata (e.g. `providerOptions`,
// `providerExecuted`) that real v7 payloads carry; the generic renderer
// surfaces it for tool-call/tool-result, so stripping it would lose data.
const AiSdkReasoningPartSchema = z
  .object({
    type: z.literal("reasoning"),
    text: z.string(),
  })
  .loose();

const AiSdkImagePartSchema = z.object({
  type: z.literal("image"),
  image: z.unknown(),
  mediaType: z.string().optional(),
});

const AiSdkFilePartSchema = z.object({
  type: z.literal("file"),
  data: z.unknown(),
  mediaType: z.string().optional(),
  filename: z.string().optional(),
});

const AiSdkToolCallPartSchema = z
  .object({
    type: z.literal("tool-call"),
    toolCallId: z.string().optional(),
    toolName: z.string().optional(),
    input: z.unknown().optional(),
  })
  .loose();

const AiSdkToolResultPartSchema = z
  .object({
    type: z.literal("tool-result"),
    toolCallId: z.string().optional(),
    toolName: z.string().optional(),
    output: z.unknown().optional(),
  })
  .loose();

const AiSdkPartSchema = z.union([
  AiSdkTextPartSchema,
  AiSdkReasoningPartSchema,
  AiSdkImagePartSchema,
  AiSdkFilePartSchema,
  AiSdkToolCallPartSchema,
  AiSdkToolResultPartSchema,
  // Exotic v7 parts (custom, reasoning-file, tool-approval-*) and any future
  // additions pass through as raw objects; the generic renderer's JSON
  // fallback surfaces them so nothing is lost.
  z.record(z.string(), z.unknown()),
]);

const AiSdkMessageSchema = z.object({
  role: z.string(),
  content: z.union([z.string(), z.array(AiSdkPartSchema)]),
});

const AiSdkMessagesSchema = z.array(AiSdkMessageSchema);

// Discriminators unique to AI SDK's native part shape. `reasoning` overlaps
// with the OpenAI Responses *item* type, but that lives at message level, not
// nested inside a `content` array, so there's no collision here.
const AI_SDK_PART_TYPES = new Set([
  "tool-call",
  "tool-result",
  "reasoning",
  "reasoning-file",
  "tool-approval-request",
  "tool-approval-response",
]);

const looksLikeAiSdkPart = (part: unknown): boolean => {
  if (typeof part !== "object" || part === null) return false;
  const type = (part as { type?: unknown }).type;
  return typeof type === "string" && AI_SDK_PART_TYPES.has(type);
};

/**
 * Narrow detection: require at least one message whose `content` is an array
 * carrying a distinctive AI-SDK part discriminator. Plain text/image-only
 * conversations without these markers are ambiguous with other formats, so we
 * let them fall through rather than over-claim.
 */
export const looksLikeAiSdkMessages = (data: unknown): boolean => {
  if (!Array.isArray(data) || data.length === 0) return false;
  return data.some((msg) => {
    if (typeof msg !== "object" || msg === null) return false;
    const content = (msg as { content?: unknown }).content;
    if (!Array.isArray(content) || content.length === 0) return false;
    return content.some(looksLikeAiSdkPart);
  });
};

const stringifyFileData = (data: unknown): string | undefined => {
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const tagged = data as { url?: unknown; data?: unknown };
    if (typeof tagged.url === "string") return tagged.url;
    if (typeof tagged.data === "string") return tagged.data;
  }
  if (data instanceof URL) return data.toString();
  return undefined;
};

const convertOne = (
  message: z.infer<typeof AiSdkMessageSchema>
): Omit<ModelMessage, "role"> & { role?: ModelMessage["role"] } => {
  const role = message.role as ModelMessage["role"];

  if (typeof message.content === "string") {
    return { role, content: message.content };
  }

  const content: any[] = [];
  for (const part of message.content) {
    const type = (part as { type?: string }).type;
    switch (type) {
      case "text": {
        const text = (part as { text?: string }).text ?? "";
        if (text.length > 0) content.push({ type: "text", text });
        break;
      }
      case "reasoning": {
        const text = (part as { text?: string }).text ?? "";
        if (text.length > 0) content.push({ ...part, type: "reasoning", text });
        break;
      }
      case "image": {
        const img = (part as { image?: unknown }).image;
        content.push({ type: "image", image: img instanceof URL ? img.toString() : img });
        break;
      }
      case "file": {
        const f = part as { data?: unknown; mediaType?: string; filename?: string };
        const data = stringifyFileData(f.data);
        // Only the string-data shape renders; otherwise fall back to JSON so
        // the payload isn't silently dropped.
        if (data !== undefined) {
          content.push({ type: "file", data, mediaType: f.mediaType, filename: f.filename });
        } else {
          content.push({ type: "text", text: JSON.stringify(part) });
        }
        break;
      }
      case "tool-call": {
        const tc = part as z.infer<typeof AiSdkToolCallPartSchema>;
        content.push({
          ...tc,
          type: "tool-call",
          toolCallId: tc.toolCallId ?? "",
          toolName: tc.toolName ?? "",
          input: tc.input,
        });
        break;
      }
      case "tool-result": {
        const tr = part as z.infer<typeof AiSdkToolResultPartSchema>;
        content.push({
          ...tr,
          type: "tool-result",
          toolCallId: tr.toolCallId ?? "",
          toolName: tr.toolName ?? "",
          output: tr.output,
        });
        break;
      }
      default: {
        // Exotic / unknown parts pass through verbatim for the generic
        // renderer's JSON fallback.
        content.push(part);
      }
    }
  }

  return { role, content };
};

/**
 * Try to parse `data` as a native AI-SDK `ModelMessage[]`. Returns null on
 * mismatch so the caller can fall back to other detectors.
 */
export const parseAiSdkMessages = (
  data: unknown
): (Omit<ModelMessage, "role"> & { role?: ModelMessage["role"] })[] | null => {
  if (!looksLikeAiSdkMessages(data)) return null;
  const result = AiSdkMessagesSchema.safeParse(data);
  if (!result.success) return null;
  return result.data.map(convertOne);
};
