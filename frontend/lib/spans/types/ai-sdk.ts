import { type ModelMessage } from "ai";
import { z } from "zod/v4";

import { type Message } from "@/lib/playground/types";
import { isStorageUrl, urlToBase64 } from "@/lib/s3";

// Native Vercel AI SDK message arrays, covering both vintages the SDK has
// stored over time:
//   - verbatim LanguageModel-level prompts / responses (LAM-1922): original
//     key casing, dash-typed parts (`tool-call`, `tool-result`, `reasoning`),
//     `file` parts with top-level `data`/`mediaType`, `providerOptions` /
//     `providerMetadata` intact;
//   - the legacy server-reshaped shape (`ai.prompt.messages` →
//     `ChatMessage`): snake_case `tool_call` parts, JSON-stringified assistant
//     content. Historical spans keep this shape in ClickHouse indefinitely.
// Structure is strict (role literals + modeled parts); media/arg payloads stay
// opaque. Not reused from the SDK's schemas — those require URL/Uint8Array
// instances that don't survive JSON.
// Spec: https://ai-sdk.dev/docs/reference/ai-sdk-core/model-message

// Declared explicitly (not via `.loose()`) so it survives the strict parse.
const ProviderOptionsSchema = z.record(z.string(), z.unknown());

// Input-level parts carry `providerOptions`; LanguageModel response content
// carries `providerMetadata`. Both must survive Zod's key-stripping.
const providerMeta = {
  providerOptions: ProviderOptionsSchema.optional(),
  providerMetadata: ProviderOptionsSchema.optional(),
};

const TextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  ...providerMeta,
});

const ReasoningPartSchema = z.object({
  type: z.literal("reasoning"),
  text: z.string(),
  ...providerMeta,
});

// `image` is polymorphic JSON; kept opaque and normalized to a string at convert time.
const ImagePartSchema = z.object({
  type: z.literal("image"),
  image: z.unknown(),
  mediaType: z.string().optional(),
  ...providerMeta,
});

// LanguageModel-level file part: top-level `data` (base64 / URL string after
// telemetry serialization) + `mediaType`. `mediaType` optional (SDK requires
// it) — serialized telemetry occasionally omits it.
const FilePartSchema = z.object({
  type: z.literal("file"),
  data: z.unknown().optional(),
  url: z.unknown().optional(),
  mediaType: z.string().optional(),
  filename: z.string().optional(),
  ...providerMeta,
});

const ToolCallPartSchema = z.object({
  type: z.literal("tool-call"),
  toolCallId: z.string(),
  toolName: z.string(),
  input: z.unknown(),
  providerExecuted: z.boolean().optional(),
  ...providerMeta,
});

const ToolResultPartSchema = z.object({
  type: z.literal("tool-result"),
  toolCallId: z.string(),
  toolName: z.string(),
  // Kept opaque: renderer shows it verbatim and pinning the v2/v3 output union
  // ({type:"text"|"json"|"content"|"error-text"|"error-json", value}) would
  // break on future variants.
  output: z.unknown(),
  ...providerMeta,
});

// Legacy server-reshaped tool call (`ChatMessageContentPart::ToolCall`).
const ServerToolCallPartSchema = z.object({
  type: z.literal("tool_call"),
  name: z.string(),
  id: z.string().nullable().optional(),
  arguments: z.unknown().optional(),
});

const CustomPartSchema = z.object({
  type: z.literal("custom"),
  kind: z.string(),
  ...providerMeta,
});

const ReasoningFilePartSchema = z.object({
  type: z.literal("reasoning-file"),
  data: z.unknown(),
  mediaType: z.string().optional(),
  ...providerMeta,
});

const ToolApprovalRequestPartSchema = z.object({
  type: z.literal("tool-approval-request"),
  approvalId: z.string(),
  toolCallId: z.string(),
  ...providerMeta,
});

const ToolApprovalResponsePartSchema = z.object({
  type: z.literal("tool-approval-response"),
  approvalId: z.string(),
  approved: z.boolean(),
  reason: z.string().optional(),
  ...providerMeta,
});

// Forward-compat escape hatch for future parts; placed LAST so modeled parts match first.
const UnknownPartSchema = z.object({ type: z.string() }).loose();

const UserContentPartSchema = z.union([TextPartSchema, ImagePartSchema, FilePartSchema, UnknownPartSchema]);

const AssistantContentPartSchema = z.union([
  TextPartSchema,
  ReasoningPartSchema,
  FilePartSchema,
  CustomPartSchema,
  ReasoningFilePartSchema,
  ToolCallPartSchema,
  ToolResultPartSchema,
  ServerToolCallPartSchema,
  ToolApprovalRequestPartSchema,
  UnknownPartSchema,
]);

// Text parts are allowed because the legacy server reshape stored tool results
// as `{type:"text"}` parts. No escape hatch beyond that — a tool message with
// anything else is malformed and must fall through.
const ToolContentPartSchema = z.union([ToolResultPartSchema, ToolApprovalResponsePartSchema, TextPartSchema]);

const isPartLike = (value: unknown): boolean =>
  typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";

// Legacy SDK versions JSON-stringified assistant `content`; decode it back,
// but only when it's genuinely a parts array.
const maybeParseStringifiedParts = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("[")) return value;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(isPartLike)) return parsed;
  } catch {
    // Not JSON — genuine text content, leave as-is.
  }
  return value;
};

const SystemMessageSchema = z.object({
  role: z.literal("system"),
  content: z.string(),
  ...providerMeta,
});

const UserMessageSchema = z.object({
  role: z.literal("user"),
  content: z.union([z.string(), z.array(UserContentPartSchema)]),
  ...providerMeta,
});

const AssistantMessageSchema = z.object({
  role: z.literal("assistant"),
  // `content` may arrive JSON-stringified (legacy SDK double-encoding); decode before validation.
  content: z.preprocess(maybeParseStringifiedParts, z.union([z.string(), z.array(AssistantContentPartSchema)])),
  ...providerMeta,
});

const ToolMessageSchema = z.object({
  role: z.literal("tool"),
  content: z.array(ToolContentPartSchema),
  ...providerMeta,
});

// Role-discriminated: an unknown role or role/content mismatch fails and falls through.
const AiSdkMessageSchema = z.discriminatedUnion("role", [
  SystemMessageSchema,
  UserMessageSchema,
  AssistantMessageSchema,
  ToolMessageSchema,
]);

const AiSdkMessagesSchema = z.array(AiSdkMessageSchema);

export type AiSdkMessage = z.infer<typeof AiSdkMessageSchema>;

// Claim only when the array carries an AI-SDK discriminator; plain
// `{role, content}` text messages are too generic — the loose OpenAI schemas
// (and the generic fallback) handle those. Runs BEFORE the OpenAI detectors,
// so this must never fire on genuine OpenAI/Anthropic/Gemini payloads.
const DISTINCTIVE_PART_TYPES = new Set([
  "reasoning",
  "reasoning-file",
  "tool-call",
  "tool-result",
  "custom",
  "tool-approval-request",
  "tool-approval-response",
  // Legacy server-reshaped tool call.
  "tool_call",
]);

const isDistinctivePart = (part: unknown): boolean => {
  if (typeof part !== "object" || part === null) return false;
  const p = part as {
    type?: string;
    data?: unknown;
    url?: unknown;
    mediaType?: unknown;
    providerOptions?: unknown;
    providerMetadata?: unknown;
  };
  if (DISTINCTIVE_PART_TYPES.has(p.type ?? "")) return true;
  // LanguageModel-level file part: top-level data|url + mediaType. OpenAI's
  // `file` part nests everything under a `file` key, so it never matches.
  if (p.type === "file" && typeof p.mediaType === "string" && (p.data !== undefined || p.url !== undefined))
    return true;
  if (p.providerOptions !== undefined || p.providerMetadata !== undefined) return true;
  return false;
};

const hasAiSdkDiscriminator = (messages: AiSdkMessage[]): boolean =>
  messages.some(
    (m) =>
      m.providerOptions !== undefined ||
      m.providerMetadata !== undefined ||
      (Array.isArray(m.content) && m.content.some(isDistinctivePart))
  );

// Extract a renderable string from polymorphic media data (renderer only shows strings).
const normalizeMediaData = (data: unknown): string | undefined => {
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const tagged = data as { url?: unknown; data?: unknown; text?: unknown };
    if (typeof tagged.url === "string") return tagged.url;
    if (typeof tagged.data === "string") return tagged.data;
    if (typeof tagged.text === "string") return tagged.text;
  }
  return undefined;
};

const isUrlOrDataUri = (value: string): boolean =>
  value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:");

// Returns a renderable image source for image-flavored file parts, else undefined.
const imageSourceFromFilePart = (part: { data?: unknown; url?: unknown; mediaType?: string }): string | undefined => {
  if (!part.mediaType?.startsWith("image/")) return undefined;
  const data = normalizeMediaData(part.data ?? part.url);
  if (data === undefined) return undefined;
  return isUrlOrDataUri(data) ? data : `data:${part.mediaType};base64,${data}`;
};

// Match `data` as an AI SDK message array. Returns null when the schema
// rejects it or no discriminator is present, so callers fall through.
export const matchAiSdkMessages = (data: unknown): AiSdkMessage[] | null => {
  const result = AiSdkMessagesSchema.safeParse(data);
  if (!result.success) return null;
  if (!hasAiSdkDiscriminator(result.data)) return null;
  return result.data;
};

// Nearly identity: drop empty text/reasoning, normalize media to a string,
// upgrade legacy snake_case tool calls, pass the rest through.
const convertOne = (message: AiSdkMessage): Omit<ModelMessage, "role"> & { role?: ModelMessage["role"] } => {
  const role = message.role as ModelMessage["role"];
  const meta: { providerOptions?: unknown; providerMetadata?: unknown } = {};
  if (message.providerOptions !== undefined) meta.providerOptions = message.providerOptions;
  if (message.providerMetadata !== undefined) meta.providerMetadata = message.providerMetadata;

  if (typeof message.content === "string") {
    return { role, content: message.content, ...meta } as Omit<ModelMessage, "role"> & {
      role?: ModelMessage["role"];
    };
  }

  const content: any[] = [];
  for (const part of message.content) {
    const p = part as {
      type?: string;
      text?: unknown;
      image?: unknown;
      data?: unknown;
      url?: unknown;
      mediaType?: string;
      name?: string;
      id?: string | null;
      arguments?: unknown;
    };
    switch (p.type) {
      case "text":
      case "reasoning": {
        if (typeof p.text === "string" && p.text.length > 0) content.push(part);
        break;
      }
      case "image": {
        content.push({ ...part, image: normalizeMediaData(p.image) ?? p.image });
        break;
      }
      case "file": {
        const imageSource = imageSourceFromFilePart(p);
        if (imageSource !== undefined) {
          content.push({ type: "image", image: imageSource });
          break;
        }
        const data = normalizeMediaData(p.data ?? p.url);
        if (data !== undefined) content.push({ ...part, data });
        // Non-string data can't render as a file; surface the JSON so it isn't lost.
        else content.push({ type: "text", text: JSON.stringify(part) });
        break;
      }
      case "tool_call": {
        content.push({
          type: "tool-call",
          toolCallId: p.id ?? "",
          toolName: p.name ?? "",
          input: p.arguments,
        });
        break;
      }
      default:
        content.push(part);
    }
  }

  return { role, content, ...meta } as Omit<ModelMessage, "role"> & { role?: ModelMessage["role"] };
};

// Returns null on mismatch so callers fall through to other detectors.
export const parseAiSdkMessages = (
  data: unknown
): (Omit<ModelMessage, "role"> & { role?: ModelMessage["role"] })[] | null => {
  const messages = matchAiSdkMessages(data);
  if (!messages) return null;
  return messages.map(convertOne);
};

type PlaygroundToolOutput = Extract<Message["content"][number], { type: "tool-result" }>["output"];

// Map the v2/v3 tool-result output union onto the playground's shape;
// anything unrecognized is stringified into a text output.
const toPlaygroundToolOutput = (output: unknown): PlaygroundToolOutput => {
  if (output && typeof output === "object") {
    const o = output as { type?: string; value?: unknown };
    switch (o.type) {
      case "text":
      case "error-text":
        return { type: o.type, value: typeof o.value === "string" ? o.value : JSON.stringify(o.value ?? null) };
      case "json":
      case "error-json":
        return { type: o.type, value: typeof o.value === "string" ? o.value : JSON.stringify(o.value ?? null) };
      case "content":
        if (Array.isArray(o.value)) return { type: "content", value: o.value as any };
        break;
    }
  }
  return { type: "text", value: typeof output === "string" ? output : JSON.stringify(output ?? null) };
};

const toPlaygroundImage = async (source: string): Promise<string> => {
  if (isStorageUrl(source)) {
    try {
      return await urlToBase64(source);
    } catch (error) {
      console.error("Error downloading AI SDK image:", error);
    }
  }
  return source;
};

export const convertAiSdkToPlaygroundMessages = async (messages: AiSdkMessage[]): Promise<Message[]> =>
  Promise.all(
    messages.map(async (message): Promise<Message> => {
      const content: Message["content"] = [];
      // Message-level providerOptions (e.g. Anthropic cacheControl) flow back
      // to generateText on rerun; providerMetadata is response-side and has no
      // meaning on resend.
      const messageOptions =
        message.providerOptions !== undefined
          ? { providerOptions: message.providerOptions as Record<string, Record<string, unknown>> }
          : {};

      if (typeof message.content === "string") {
        content.push({ type: "text", text: message.content });
        return { role: message.role, content, ...messageOptions };
      }

      for (const part of message.content) {
        const p = part as {
          type?: string;
          text?: unknown;
          image?: unknown;
          data?: unknown;
          url?: unknown;
          mediaType?: string;
          toolCallId?: string;
          toolName?: string;
          input?: unknown;
          output?: unknown;
          name?: string;
          id?: string | null;
          arguments?: unknown;
          providerOptions?: unknown;
        };
        // Part-level providerOptions survive where the playground type carries
        // them (text / tool-call); providerMetadata is response-side and has no
        // playground slot.
        const partOptions =
          p.providerOptions !== undefined
            ? { providerOptions: p.providerOptions as Record<string, Record<string, unknown>> }
            : {};
        switch (p.type) {
          case "text": {
            if (typeof p.text === "string" && p.text.length > 0)
              content.push({ type: "text", text: p.text, ...partOptions });
            break;
          }
          case "reasoning": {
            // Reasoning renders as plain text; its providerOptions (e.g.
            // thinking signatures) don't apply to a text part, so drop them.
            if (typeof p.text === "string" && p.text.length > 0) content.push({ type: "text", text: p.text });
            break;
          }
          case "image": {
            const source = normalizeMediaData(p.image);
            if (source !== undefined) content.push({ type: "image", image: await toPlaygroundImage(source) });
            // Non-string image data can't render; surface the JSON so it isn't lost.
            else content.push({ type: "text", text: JSON.stringify(part) });
            break;
          }
          case "file": {
            const imageSource = imageSourceFromFilePart(p);
            if (imageSource !== undefined) {
              content.push({ type: "image", image: await toPlaygroundImage(imageSource) });
            } else {
              content.push({ type: "text", text: JSON.stringify(part) });
            }
            break;
          }
          case "tool-call": {
            content.push({
              type: "tool-call",
              toolCallId: p.toolCallId ?? "",
              toolName: p.toolName ?? "",
              input: p.input,
              ...partOptions,
            });
            break;
          }
          case "tool_call": {
            content.push({
              type: "tool-call",
              toolCallId: p.id ?? "",
              toolName: p.name ?? "",
              input: p.arguments,
            });
            break;
          }
          case "tool-result": {
            content.push({
              type: "tool-result",
              toolCallId: p.toolCallId ?? "",
              toolName: p.toolName ?? "",
              output: toPlaygroundToolOutput(p.output),
            });
            break;
          }
          default:
            content.push({ type: "text", text: JSON.stringify(part) });
        }
      }

      return { role: message.role, content, ...messageOptions };
    })
  );
