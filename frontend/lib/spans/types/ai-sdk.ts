import { type ModelMessage } from "ai";
import { z } from "zod/v4";

// Native Vercel AI SDK v7 `ModelMessage[]` (dash-style parts). Structure is
// strict (role literals + modeled parts); media/arg payloads stay opaque. Not
// reused from the SDK's schemas — those require URL/Uint8Array instances that
// don't survive JSON. Spec: https://ai-sdk.dev/docs/reference/ai-sdk-core/model-message

// Declared explicitly (not via `.loose()`) so it survives the strict parse.
const ProviderOptionsSchema = z.record(z.string(), z.unknown());

const TextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  providerOptions: ProviderOptionsSchema.optional(),
});

const ReasoningPartSchema = z.object({
  type: z.literal("reasoning"),
  text: z.string(),
  providerOptions: ProviderOptionsSchema.optional(),
});

// `image` is polymorphic JSON; kept opaque and normalized to a string at convert time.
const ImagePartSchema = z.object({
  type: z.literal("image"),
  image: z.unknown(),
  mediaType: z.string().optional(),
  providerOptions: ProviderOptionsSchema.optional(),
});

// `mediaType` optional (SDK requires it) — serialized telemetry often omits it.
const FilePartSchema = z.object({
  type: z.literal("file"),
  data: z.unknown(),
  mediaType: z.string().optional(),
  filename: z.string().optional(),
  providerOptions: ProviderOptionsSchema.optional(),
});

const ToolCallPartSchema = z.object({
  type: z.literal("tool-call"),
  toolCallId: z.string(),
  toolName: z.string(),
  input: z.unknown(),
  providerExecuted: z.boolean().optional(),
  providerOptions: ProviderOptionsSchema.optional(),
});

const ToolResultPartSchema = z.object({
  type: z.literal("tool-result"),
  toolCallId: z.string(),
  toolName: z.string(),
  // Kept opaque: renderer shows it verbatim and pinning the union would break on future variants.
  output: z.unknown(),
  providerOptions: ProviderOptionsSchema.optional(),
});

const CustomPartSchema = z.object({
  type: z.literal("custom"),
  kind: z.string(),
  providerOptions: ProviderOptionsSchema.optional(),
});

const ReasoningFilePartSchema = z.object({
  type: z.literal("reasoning-file"),
  data: z.unknown(),
  mediaType: z.string().optional(),
  providerOptions: ProviderOptionsSchema.optional(),
});

const ToolApprovalRequestPartSchema = z.object({
  type: z.literal("tool-approval-request"),
  approvalId: z.string(),
  toolCallId: z.string(),
  providerOptions: ProviderOptionsSchema.optional(),
});

const ToolApprovalResponsePartSchema = z.object({
  type: z.literal("tool-approval-response"),
  approvalId: z.string(),
  approved: z.boolean(),
  reason: z.string().optional(),
  providerOptions: ProviderOptionsSchema.optional(),
});

// Server-reshaped AI SDK tool call: app-server stores instrumentation `tool-call`
// parts as `{type: "tool_call", name, id, arguments}`. With unknown parts (e.g.
// `reasoning`) now preserved verbatim server-side (LAM-1912), a stored assistant
// turn mixes dash-style raw parts with this snake-case shape; converted back to a
// dash-style `tool-call` at convert time.
const ServerToolCallPartSchema = z.object({
  type: z.literal("tool_call"),
  name: z.string(),
  id: z.string().nullable().optional(),
  arguments: z.unknown(),
});

// Forward-compat escape hatch for future v7 parts; placed LAST so modeled parts match first.
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
  ToolApprovalRequestPartSchema,
  ServerToolCallPartSchema,
  UnknownPartSchema,
]);

// Strict, no escape hatch — a tool message with anything else is malformed and must fall through.
const ToolContentPartSchema = z.union([ToolResultPartSchema, ToolApprovalResponsePartSchema]);

const isPartLike = (value: unknown): boolean =>
  typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";

// SDK JSON-stringifies assistant `content`; decode it back, but only when it's genuinely a parts array.
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
  providerOptions: ProviderOptionsSchema.optional(),
});

const UserMessageSchema = z.object({
  role: z.literal("user"),
  content: z.union([z.string(), z.array(UserContentPartSchema)]),
  providerOptions: ProviderOptionsSchema.optional(),
});

const AssistantMessageSchema = z.object({
  role: z.literal("assistant"),
  // `content` may arrive JSON-stringified (SDK double-encoding); decode before validation.
  content: z.preprocess(maybeParseStringifiedParts, z.union([z.string(), z.array(AssistantContentPartSchema)])),
  providerOptions: ProviderOptionsSchema.optional(),
});

const ToolMessageSchema = z.object({
  role: z.literal("tool"),
  content: z.array(ToolContentPartSchema),
  providerOptions: ProviderOptionsSchema.optional(),
});

// Role-discriminated: an unknown role or role/content mismatch fails and falls through.
const AiSdkMessageSchema = z.discriminatedUnion("role", [
  SystemMessageSchema,
  UserMessageSchema,
  AssistantMessageSchema,
  ToolMessageSchema,
]);

const AiSdkMessagesSchema = z.array(AiSdkMessageSchema);

type ParsedMessage = z.infer<typeof AiSdkMessageSchema>;

// Claim only when a message carries one of these; text/image/file are too generic.
const DISTINCTIVE_PART_TYPES = new Set([
  "reasoning",
  "reasoning-file",
  "tool-call",
  "tool-result",
  "custom",
  "tool-approval-request",
  "tool-approval-response",
]);

const hasDistinctivePart = (messages: ParsedMessage[]): boolean =>
  messages.some(
    (m) =>
      Array.isArray(m.content) &&
      m.content.some((part) => DISTINCTIVE_PART_TYPES.has((part as { type?: string }).type ?? ""))
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

// Nearly identity: drop empty text/reasoning, normalize media to a string, pass the rest through.
const convertOne = (message: ParsedMessage): Omit<ModelMessage, "role"> & { role?: ModelMessage["role"] } => {
  const role = message.role as ModelMessage["role"];

  if (typeof message.content === "string") {
    return { role, content: message.content };
  }

  const content: any[] = [];
  for (const part of message.content) {
    const p = part as { type?: string; text?: unknown; image?: unknown; data?: unknown };
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
        const data = normalizeMediaData(p.data);
        if (data !== undefined) content.push({ ...part, data });
        // Non-string data can't render as a file; surface the JSON so it isn't lost.
        else content.push({ type: "text", text: JSON.stringify(part) });
        break;
      }
      case "tool_call": {
        const tc = part as z.infer<typeof ServerToolCallPartSchema>;
        content.push({
          type: "tool-call",
          toolCallId: tc.id ?? "",
          toolName: tc.name,
          input: tc.arguments,
        });
        break;
      }
      default:
        content.push(part);
    }
  }

  return { role, content };
};

// Returns null when the schema rejects it or no distinctive part is present, so callers fall through.
export const parseAiSdkMessages = (
  data: unknown
): (Omit<ModelMessage, "role"> & { role?: ModelMessage["role"] })[] | null => {
  const result = AiSdkMessagesSchema.safeParse(data);
  if (!result.success) return null;
  if (!hasDistinctivePart(result.data)) return null;
  return result.data.map(convertOne);
};
