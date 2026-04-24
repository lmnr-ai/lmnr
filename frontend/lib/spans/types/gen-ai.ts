import { type ModelMessage } from "ai";
import { z } from "zod/v4";

/**
 * OpenTelemetry GenAI semantic-convention message shape.
 *
 * Emitted by pydantic_ai v5 and other spec-compliant libraries via
 * `gen_ai.input.messages` / `gen_ai.output.messages`. Each message has a role
 * and a `parts` array where each part carries a `type` discriminator.
 *
 * Part types recognised:
 *   - `text`              : `{ type, content }`
 *   - `thinking`          : `{ type, content }`           (surfaced as text)
 *   - `tool_call`         : `{ type, id, name, arguments }`
 *   - `tool_call_response`: `{ type, id, name, result }`
 *   - `uri`               : `{ type, uri, modality?, mime_type? }`
 *   - `blob`              : `{ type, content (base64), mime_type, modality? }`
 *
 * Spec: https://opentelemetry.io/docs/specs/semconv/gen-ai/
 */

export const GenAITextPartSchema = z.object({
  type: z.literal("text"),
  content: z.string().optional(),
});

export const GenAIThinkingPartSchema = z.object({
  type: z.literal("thinking"),
  content: z.string().optional(),
});

export const GenAIToolCallPartSchema = z.object({
  type: z.literal("tool_call"),
  id: z.string().optional(),
  name: z.string().optional(),
  arguments: z.unknown().optional(),
});

export const GenAIToolCallResponsePartSchema = z.object({
  type: z.literal("tool_call_response"),
  id: z.string().optional(),
  name: z.string().optional(),
  result: z.unknown().optional(),
});

export const GenAIUriPartSchema = z.object({
  type: z.literal("uri"),
  uri: z.string(),
  modality: z.string().optional(),
  mime_type: z.string().optional(),
});

export const GenAIBlobPartSchema = z.object({
  type: z.literal("blob"),
  content: z.string().optional(),
  mime_type: z.string().optional(),
  modality: z.string().optional(),
});

export const GenAIPartSchema = z.union([
  GenAITextPartSchema,
  GenAIThinkingPartSchema,
  GenAIToolCallPartSchema,
  GenAIToolCallResponsePartSchema,
  GenAIUriPartSchema,
  GenAIBlobPartSchema,
  // Bare strings (e.g. `system_instructions: ["Be helpful"]`) are a valid
  // emitter variant — treat them as implicit text parts below.
  z.string(),
  // Unknown part shapes pass through as raw objects so the conversion can
  // fall back to a stringified representation instead of failing parsing.
  z.record(z.string(), z.unknown()),
]);

export const GenAIMessageSchema = z.object({
  role: z.string(),
  parts: z.array(GenAIPartSchema),
  finish_reason: z.string().optional(),
});

export const GenAIMessagesSchema = z.array(GenAIMessageSchema);

/**
 * Detect whether a value looks like a GenAI-semconv message array. The test
 * is intentionally narrow — it checks for at least one part with a GenAI-style
 * `type` discriminator, so we don't accidentally swallow OpenAI/Anthropic/
 * LangChain payloads that happen to have a `parts` field.
 */
const GENAI_PART_TYPES = new Set(["text", "thinking", "tool_call", "tool_call_response", "uri", "blob"]);

// Bare strings are a valid *part* shape (the Zod schema accepts them), but they
// are NOT a reliable detection signal — any emitter with `{role, parts: ["..."]}`
// would otherwise be misidentified as GenAI. Detection requires at least one
// object part whose `type` matches a known GenAI discriminator; strings still
// parse fine once we've committed to the GenAI path.
const looksLikeGenAIPart = (part: unknown): boolean => {
  if (typeof part !== "object" || part === null) return false;
  const type = (part as { type?: unknown }).type;
  return typeof type === "string" && GENAI_PART_TYPES.has(type);
};

const looksLikeGenAIMessages = (data: unknown): boolean => {
  if (!Array.isArray(data) || data.length === 0) return false;
  return data.some((msg) => {
    if (typeof msg !== "object" || msg === null) return false;
    const parts = (msg as { parts?: unknown }).parts;
    if (!Array.isArray(parts) || parts.length === 0) return false;
    return parts.some(looksLikeGenAIPart);
  });
};

/**
 * Convert one GenAI message to a `ModelMessage` — the generic shape the
 * existing `ContentParts` renderer already handles.
 */
const convertOne = (
  message: z.infer<typeof GenAIMessageSchema>,
  toolNames: Map<string, string>
): Omit<ModelMessage, "role"> & { role?: ModelMessage["role"] } => {
  const content: any[] = [];
  for (const part of message.parts) {
    // Bare strings → implicit text parts.
    if (typeof part === "string") {
      if (part.length > 0) content.push({ type: "text", text: part });
      continue;
    }
    const type = (part as { type?: string }).type;
    switch (type) {
      case "text": {
        const text = (part as { content?: string }).content ?? "";
        if (text.length > 0) content.push({ type: "text", text });
        break;
      }
      case "thinking": {
        // Emit as a ModelMessage `reasoning` part (not `text`) so the generic
        // renderer can surface it with a distinct "Thinking" label — matching
        // how dedicated provider renderers (e.g. Anthropic) display their
        // thinking blocks. Without this, thinking content is visually
        // indistinguishable from regular assistant text.
        const text = (part as { content?: string }).content ?? "";
        if (text.length > 0) content.push({ type: "reasoning", text });
        break;
      }
      case "tool_call": {
        const tc = part as z.infer<typeof GenAIToolCallPartSchema>;
        const toolCallId = tc.id ?? "";
        const toolName = tc.name ?? "";
        if (toolCallId) toolNames.set(toolCallId, toolName);
        content.push({
          type: "tool-call",
          toolCallId,
          toolName,
          input: tc.arguments,
        });
        break;
      }
      case "tool_call_response": {
        const tr = part as z.infer<typeof GenAIToolCallResponsePartSchema>;
        const toolCallId = tr.id ?? "";
        const toolName = tr.name ?? toolNames.get(toolCallId) ?? "";
        const result = tr.result;
        const output =
          typeof result === "string"
            ? { type: "text", value: result }
            : { type: "json", value: JSON.stringify(result ?? null) };
        content.push({ type: "tool-result", toolCallId, toolName, output });
        break;
      }
      case "uri": {
        const u = part as z.infer<typeof GenAIUriPartSchema>;
        if (u.modality === "image" || u.mime_type?.startsWith("image/")) {
          content.push({ type: "image", image: u.uri });
        } else {
          content.push({
            type: "file",
            data: u.uri,
            mimeType: u.mime_type ?? "application/octet-stream",
          });
        }
        break;
      }
      case "blob": {
        const b = part as z.infer<typeof GenAIBlobPartSchema>;
        const data = b.content ?? "";
        const mime = b.mime_type ?? "application/octet-stream";
        if (b.modality === "image" || mime.startsWith("image/")) {
          const src = data.startsWith("data:") ? data : `data:${mime};base64,${data}`;
          content.push({ type: "image", image: src });
        } else {
          content.push({ type: "file", data, mimeType: mime });
        }
        break;
      }
      default: {
        // Unknown part → surface its JSON so the payload isn't lost.
        content.push({ type: "text", text: JSON.stringify(part) });
      }
    }
  }

  // Map GenAI roles to ModelMessage roles the generic renderer understands.
  // Everything unknown falls through verbatim — the renderer tolerates it.
  const role = message.role as ModelMessage["role"] | string;
  return { role: role as ModelMessage["role"], content };
};

/**
 * Try to parse `data` as a GenAI-semconv message array. Returns null on
 * mismatch so the caller can fall back to other detectors.
 */
export const parseGenAIMessages = (
  data: unknown
): (Omit<ModelMessage, "role"> & { role?: ModelMessage["role"] })[] | null => {
  if (!looksLikeGenAIMessages(data)) return null;
  const result = GenAIMessagesSchema.safeParse(data);
  if (!result.success) return null;
  const toolNames = new Map<string, string>();
  return result.data.map((msg) => convertOne(msg, toolNames));
};
