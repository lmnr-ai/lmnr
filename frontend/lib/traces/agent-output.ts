/**
 * Shared extraction of the "valuable bits" from an LLM span's output messages
 * (the `trace_outputs_v0.agent_output` array — one raw message JSON per
 * element, usually `{role, content}` or `{role, parts}`).
 *
 * Per part we keep: non-empty `thinking` / `reasoning`, non-empty `text`
 * (or GenAI-style `content`), and tool calls (rendered as `Tool: <name>`,
 * no arguments). The walk is deliberately permissive: a RECOGNIZED but empty
 * part yields nothing, an unknown part is stringified verbatim, and when the
 * whole array yields nothing the raw messages are dumped as-is — better to
 * extract more than to extract nothing.
 */

const CONTAINER_KEYS = ["content", "parts", "summary"] as const;

/** Part `type`s that carry a tool invocation across provider formats. */
const TOOL_CALL_TYPES = new Set([
  "tool_call",
  "tool-call",
  "tool_use",
  "server_tool_use",
  "function_call",
  "function-call",
  "mcp_call",
]);

/** Part `type`s we recognize as text-free bookkeeping — skip without fallback. */
const NON_CONTENT_TYPES = new Set([
  "tool_result",
  "tool-result",
  "tool_call_response",
  "function_call_output",
  "redacted_thinking",
  "image",
  "image_url",
  "input_image",
  "file",
  "audio",
  "blob",
  "uri",
]);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const nonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

const stringifyLoose = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  try {
    const s = JSON.stringify(v);
    return s && s !== "{}" && s !== "[]" ? s : null;
  } catch {
    return null;
  }
};

/** Resolve a tool-call part's name across formats (OpenAI nested
 *  `{function: {name}}`, flat `{name|tool_name|toolName}`) and render it as
 *  `Tool: <name>` — arguments are deliberately not shown. */
const renderToolCall = (obj: Record<string, unknown>): string | null => {
  const fn = isRecord(obj.function) ? obj.function : undefined;
  const name = [fn?.name, obj.name, obj.tool_name, obj.toolName].find(nonEmptyString);
  if (name) return `Tool: ${name.trim()}`;
  // No name — keep the whole part rather than dropping the call.
  return stringifyLoose(obj);
};

const isToolCallPart = (obj: Record<string, unknown>): boolean => {
  const type = typeof obj.type === "string" ? obj.type.toLowerCase() : undefined;
  if (type && TOOL_CALL_TYPES.has(type)) return true;
  // OpenAI chat-completion tool_calls entries have no `type: tool_call`
  // discriminator — they carry `{type: "function", function: {...}}`.
  return type === "function" && isRecord(obj.function);
};

const extractFromPart = (part: unknown): string | null => {
  if (part === null || part === undefined) return null;
  if (typeof part === "string") return part.trim() || null;
  if (Array.isArray(part)) return joinNonEmpty(part.map(extractFromPart));
  if (!isRecord(part)) return stringifyLoose(part);

  if (isToolCallPart(part)) return renderToolCall(part);

  const pieces: string[] = [];
  // Thinking / reasoning: string directly, or nested text (AI SDK reasoning
  // parts are `{type: "reasoning", text}` — covered by the text branch below).
  for (const key of ["thinking", "reasoning"]) {
    if (nonEmptyString(part[key])) pieces.push((part[key] as string).trim());
  }
  if (nonEmptyString(part.text)) {
    pieces.push(part.text.trim());
  } else if (nonEmptyString(part.content)) {
    // OTel GenAI text parts carry `{type: "text", content}`.
    pieces.push(part.content.trim());
  } else if (Array.isArray(part.content) || Array.isArray(part.summary)) {
    // Nested containers (e.g. OpenAI Responses `message` / `reasoning` items).
    const nested = joinNonEmpty(
      [...(Array.isArray(part.content) ? part.content : []), ...(Array.isArray(part.summary) ? part.summary : [])].map(
        extractFromPart
      )
    );
    if (nested) pieces.push(nested);
  }

  if (pieces.length > 0) return pieces.join("\n\n");

  const type = typeof part.type === "string" ? part.type.toLowerCase() : undefined;
  if (type && NON_CONTENT_TYPES.has(type)) return null;
  // Recognized text-bearing shape that happens to be empty — not worth JSON noise.
  if ("text" in part || "thinking" in part || "reasoning" in part || "content" in part || "summary" in part) {
    return null;
  }
  // Unknown part: extract more rather than nothing.
  return stringifyLoose(part);
};

const extractFromMessage = (message: unknown): string | null => {
  if (message === null || message === undefined) return null;
  if (typeof message === "string") return message.trim() || null;
  if (Array.isArray(message)) return joinNonEmpty(message.map(extractFromMessage));
  if (!isRecord(message)) return stringifyLoose(message);

  const pieces: string[] = [];
  let recognized = false;

  for (const key of CONTAINER_KEYS) {
    const body = message[key];
    if (body === undefined) continue;
    recognized = true;
    const text = extractFromPart(body);
    if (text) pieces.push(text);
  }

  // OpenAI chat-completion assistant messages carry tool calls at the
  // message level, not as content parts.
  if (Array.isArray(message.tool_calls)) {
    recognized = true;
    for (const call of message.tool_calls) {
      const text = isRecord(call) ? renderToolCall(call) : stringifyLoose(call);
      if (text) pieces.push(text);
    }
  }

  if (pieces.length > 0) return pieces.join("\n\n");
  if (recognized || "role" in message) return null;
  // Unknown message shape: extract more rather than nothing.
  return stringifyLoose(message);
};

const joinNonEmpty = (parts: (string | null)[]): string | null => {
  const filtered = parts.filter((p): p is string => !!p);
  return filtered.length > 0 ? filtered.join("\n\n") : null;
};

/**
 * Extract display text from an LLM span's output-message array. Elements may
 * be raw JSON strings (as returned by `trace_outputs_v0`) or already-parsed
 * message objects. When nothing valuable was extracted from ANY message,
 * falls back to dumping the raw messages verbatim — better than nothing.
 * Returns null only for an entirely empty array.
 */
export const extractAgentOutput = (messages: unknown[]): string | null => {
  const extracted = joinNonEmpty(
    messages.map((raw) => {
      if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (!trimmed) return null;
        try {
          return extractFromMessage(JSON.parse(trimmed));
        } catch {
          // Not JSON — treat as plain text.
          return trimmed;
        }
      }
      return extractFromMessage(raw);
    })
  );
  if (extracted) return extracted;
  return joinNonEmpty(messages.map(stringifyLoose));
};
