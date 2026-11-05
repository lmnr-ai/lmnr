import { type ProcessedMessages } from "@/lib/spans/process-messages";
import { segmentMessageRole } from "@/lib/spans/turn";

// `preview` is a bounded one-line summary, computed once so collapsed rows never serialize full payloads.
export type TurnPart =
  | { kind: "text"; text: string }
  | { kind: "reasoning"; text: string; preview: string }
  | { kind: "tool-call"; id?: string; name: string; args: unknown; preview: string; result?: ToolResultPart }
  | ToolResultPart;

export interface ToolResultPart {
  kind: "tool-result";
  id?: string;
  name?: string;
  output: unknown;
  preview: string;
  /** The call this result answers, when it can be matched. */
  call?: { args: unknown; preview: string };
}

type RawPart = TurnPart extends infer P ? (P extends { preview: string } ? Omit<P, "preview"> : P) : never;

export interface NormalizedMessage {
  role: string;
  parts: TurnPart[];
}

type Loose = Record<string, any>;

const PREVIEW_LENGTH = 240;

/** JSON-ish one-liner that stops walking once it has PREVIEW_LENGTH characters. */
export const buildPreview = (value: unknown): string => {
  let out = "";
  const write = (text: string) => {
    out += text;
    return out.length < PREVIEW_LENGTH;
  };
  const walk = (v: unknown): boolean => {
    if (typeof v === "string") return write(JSON.stringify(v.slice(0, PREVIEW_LENGTH)));
    if (v === null || typeof v !== "object") return write(String(v));
    if (Array.isArray(v)) {
      if (!write("[")) return false;
      for (let i = 0; i < v.length; i++) {
        if ((i > 0 && !write(",")) || !walk(v[i])) return false;
      }
      return write("]");
    }
    if (!write("{")) return false;
    let first = true;
    for (const key of Object.keys(v)) {
      if (!write(`${first ? "" : ","}${JSON.stringify(key)}:`) || !walk((v as Loose)[key])) return false;
      first = false;
    }
    return write("}");
  };
  if (typeof value === "string") out = value.slice(0, PREVIEW_LENGTH * 4);
  else walk(value);
  return out.replace(/\s+/g, " ").trim().slice(0, PREVIEW_LENGTH);
};

const withPreview = (part: RawPart): TurnPart => {
  switch (part.kind) {
    case "text":
      return part;
    case "reasoning":
      return { ...part, preview: buildPreview(part.text) };
    case "tool-call":
      return { ...part, preview: buildPreview(part.args) };
    case "tool-result":
      return { ...part, preview: buildPreview(part.output) };
  }
};

// Unrecognized parts make the whole message fall back to its provider renderer, so nothing is dropped.
class Unsupported extends Error {}
const unsupported = (): never => {
  throw new Unsupported();
};

const parseArgs = (args: unknown): unknown => {
  if (typeof args !== "string") return args ?? {};
  try {
    return JSON.parse(args);
  } catch {
    return args;
  }
};

const textParts = (content: unknown, textTypes: string[]): RawPart[] => {
  if (content == null || content === "") return [];
  if (typeof content === "string") return [{ kind: "text", text: content }];
  if (!Array.isArray(content)) return unsupported();
  return content.map((part: Loose) =>
    textTypes.includes(part?.type) && typeof part.text === "string"
      ? { kind: "text" as const, text: part.text }
      : unsupported()
  );
};

const resultOutput = (content: unknown): unknown =>
  Array.isArray(content) && content.every((p: Loose) => p?.type === "text")
    ? content.map((p: Loose) => p.text).join("\n")
    : content;

const openai = (m: Loose): RawPart[] => {
  if (m.role === "tool") return [{ kind: "tool-result", id: m.tool_call_id, output: resultOutput(m.content) }];
  return [
    ...textParts(m.content, ["text"]),
    ...(m.tool_calls ?? []).map((tc: Loose) => ({
      kind: "tool-call" as const,
      id: tc.id,
      name: tc.function?.name ?? "tool",
      args: parseArgs(tc.function?.arguments),
    })),
  ];
};

const anthropic = (m: Loose): RawPart[] => {
  if (typeof m.content === "string") return textParts(m.content, []);
  return (m.content ?? []).map((b: Loose): RawPart => {
    switch (b.type) {
      case "text":
        return { kind: "text", text: b.text };
      case "thinking":
        return { kind: "reasoning", text: b.thinking };
      case "redacted_thinking":
        return { kind: "reasoning", text: "[Redacted thinking]" };
      case "tool_use":
      case "server_tool_use":
        return { kind: "tool-call", id: b.id, name: b.name, args: b.input ?? {} };
      case "tool_result":
      case "web_search_tool_result":
        return { kind: "tool-result", id: b.tool_use_id, output: resultOutput(b.content) };
      default:
        return unsupported();
    }
  });
};

const responses = (m: Loose): RawPart[] => {
  switch (m.type ?? "message") {
    case "message":
      return textParts(m.content, ["input_text", "output_text"]);
    case "reasoning": {
      const text = [...(m.summary ?? []), ...(m.content ?? [])].map((p: Loose) => p.text).join("\n\n");
      return [{ kind: "reasoning", text }];
    }
    case "function_call":
      return [{ kind: "tool-call", id: m.call_id, name: m.name, args: parseArgs(m.arguments) }];
    case "custom_tool_call":
      return [{ kind: "tool-call", id: m.call_id, name: m.name, args: m.input }];
    case "function_call_output":
    case "custom_tool_call_output":
      return [{ kind: "tool-result", id: m.call_id, output: resultOutput(m.output) }];
    default:
      return unsupported();
  }
};

const langchain = (m: Loose): RawPart[] => {
  if (m.role === "tool") return [{ kind: "tool-result", id: m.tool_call_id, output: resultOutput(m.content) }];
  if (m.invalid_tool_calls?.length) return unsupported();
  return [
    ...textParts(m.content, ["text"]),
    ...(m.tool_calls ?? []).map((tc: Loose) => ({
      kind: "tool-call" as const,
      id: tc.id,
      name: tc.name,
      args: tc.args ?? {},
    })),
  ];
};

const gemini = (m: Loose): RawPart[] =>
  (m.parts ?? []).map((p: Loose): RawPart => {
    if (typeof p.text === "string") return { kind: p.thought ? "reasoning" : "text", text: p.text };
    if (p.functionCall) return { kind: "tool-call", name: p.functionCall.name, args: p.functionCall.args ?? {} };
    if (p.functionResponse) {
      return { kind: "tool-result", name: p.functionResponse.name, output: p.functionResponse.response };
    }
    return unsupported();
  });

const generic = (m: Loose): RawPart[] => {
  if (typeof m.content === "string") return textParts(m.content, []);
  return (m.content ?? []).map((p: Loose): RawPart => {
    switch (p.type) {
      case "text":
        return { kind: "text", text: p.text };
      case "reasoning":
        return { kind: "reasoning", text: p.text };
      case "tool-call":
        return { kind: "tool-call", id: p.toolCallId, name: p.toolName, args: p.input ?? p.args ?? {} };
      case "tool-result": {
        const output = p.output?.type === "text" || p.output?.type === "json" ? p.output.value : p.output;
        return { kind: "tool-result", id: p.toolCallId, name: p.toolName, output: output ?? p.result };
      }
      default:
        return unsupported();
    }
  });
};

const PARSERS: Record<ProcessedMessages["type"], (m: Loose) => RawPart[]> = {
  openai,
  anthropic,
  "openai-responses": responses,
  langchain,
  gemini,
  generic,
};

// Keyed by the parsed message object, so toggling history or switching layouts never re-normalizes a message.
const cache = new WeakMap<object, NormalizedMessage | null>();

/** Flattens one provider message into text / reasoning / tool parts, or null when it holds anything else. */
export const normalizeMessage = (segment: ProcessedMessages, index: number): NormalizedMessage | null => {
  const message = segment.messages[index] as Loose;
  const cached = cache.get(message);
  if (cached !== undefined) return cached;
  let normalized: NormalizedMessage | null;
  try {
    const parts = PARSERS[segment.type](message).map(withPreview);
    normalized = { role: segmentMessageRole(segment, index) ?? "assistant", parts };
  } catch (e) {
    if (!(e instanceof Unsupported)) throw e;
    normalized = null;
  }
  cache.set(message, normalized);
  return normalized;
};

type ToolCallPart = Extract<TurnPart, { kind: "tool-call" }>;
type Messages = (NormalizedMessage | null)[];

const matchKey = (part: { id?: string; name?: string }) => part.id ?? (part.name ? `name:${part.name}` : undefined);

// Matches each result to the earliest unanswered call with its call id, or its name when the format has no ids.
const forEachMatch = (messages: Messages, visit: (call: ToolCallPart, result: ToolResultPart) => void) => {
  const pending = new Map<string, ToolCallPart[]>();
  for (const part of messages.flatMap((message) => message?.parts ?? [])) {
    const key = part.kind === "tool-call" || part.kind === "tool-result" ? matchKey(part) : undefined;
    if (!key) continue;
    if (part.kind === "tool-call") pending.set(key, [...(pending.get(key) ?? []), part]);
    else if (part.kind === "tool-result") {
      const call = pending.get(key)?.shift();
      if (call) visit(call, part);
    }
  }
};

const mapParts = (messages: Messages, fn: (part: TurnPart) => TurnPart | null): Messages =>
  messages.map((message) => message && { ...message, parts: message.parts.flatMap((part) => fn(part) ?? []) });

/** Gives each result its call's name and arguments, so a result row can say what it answers. */
export const linkToolResults = (messages: Messages): Messages => {
  const calls = new Map<ToolResultPart, ToolCallPart>();
  forEachMatch(messages, (call, result) => calls.set(result, call));
  return mapParts(messages, (part) => {
    const call = part.kind === "tool-result" ? calls.get(part) : undefined;
    return call && part.kind === "tool-result"
      ? { ...part, name: part.name ?? call.name, call: { args: call.args, preview: call.preview } }
      : part;
  });
};

/** Moves each result under the call that produced it. Unmatched results stay where they are. */
export const pairToolResults = (messages: Messages): Messages => {
  const results = new Map<ToolCallPart, ToolResultPart>();
  forEachMatch(messages, (call, result) => results.set(call, result));
  const paired = new Set(results.values());
  return mapParts(messages, (part) => {
    if (part.kind === "tool-result" && paired.has(part)) return null;
    const result = part.kind === "tool-call" ? results.get(part) : undefined;
    return result ? { ...(part as ToolCallPart), result } : part;
  });
};
