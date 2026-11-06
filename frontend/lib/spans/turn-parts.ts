import { type ProcessedMessages } from "@/lib/spans/process-messages";
import { segmentMessageRole } from "@/lib/spans/turn";

// `preview` is a bounded one-line summary, computed once so collapsed rows never serialize full payloads.
export type TurnPart =
  | { kind: "text"; text: string }
  | { kind: "reasoning"; text: string; preview: string }
  | ToolCallPart
  | ToolResultPart;

interface ToolCallPart {
  kind: "tool-call";
  id?: string;
  name: string;
  args: unknown;
  preview: string;
  result?: ToolResultPart;
}

export interface ToolResultPart {
  kind: "tool-result";
  id?: string;
  name?: string;
  output: unknown;
  preview: string;
  /** The call this result answers, when it can be matched. */
  call?: { args: unknown; preview: string };
}

export interface NormalizedMessage {
  role: string;
  parts: TurnPart[];
}

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
    for (const [key, item] of Object.entries(v)) {
      if (!write(`${first ? "" : ","}${JSON.stringify(key)}:`) || !walk(item)) return false;
      first = false;
    }
    return write("}");
  };
  if (typeof value === "string") out = value.slice(0, PREVIEW_LENGTH * 4);
  else walk(value);
  return out.replace(/\s+/g, " ").trim().slice(0, PREVIEW_LENGTH);
};

const text = (value: string): TurnPart => ({ kind: "text", text: value });
const reasoning = (value: string): TurnPart => ({ kind: "reasoning", text: value, preview: buildPreview(value) });
const toolCall = (id: string | undefined, name: string, args: unknown): TurnPart => ({
  kind: "tool-call",
  id,
  name,
  args,
  preview: buildPreview(args),
});
const toolResult = (id: string | undefined, output: unknown, name?: string): TurnPart => ({
  kind: "tool-result",
  id,
  ...(name && { name }),
  output,
  preview: buildPreview(output),
});

/** null: the message holds something these parts can't show (images, files, ...), so its provider renderer takes it. */
type Parts = TurnPart[] | null;

const every = (parts: (TurnPart | null)[]): Parts => (parts.every((part) => part !== null) ? parts : null);

const TEXT_TYPES = new Set(["text", "input_text", "output_text"]);

const textOnly = (content: string | null | undefined | readonly { type: string; text?: unknown }[]): Parts => {
  if (!content) return [];
  if (typeof content === "string") return [text(content)];
  return every(content.map((p) => (TEXT_TYPES.has(p.type) && typeof p.text === "string" ? text(p.text) : null)));
};

const isTextPart = (p: unknown): p is { type: "text"; text: string } =>
  typeof p === "object" && p !== null && "type" in p && p.type === "text" && "text" in p && typeof p.text === "string";

// A result made only of text parts reads as one string.
const resultOutput = (content: unknown): unknown =>
  Array.isArray(content) && content.every(isTextPart) ? content.map((p) => p.text).join("\n") : content;

const parseArgs = (args: string): unknown => {
  try {
    return JSON.parse(args);
  } catch {
    return args;
  }
};

const withCalls = (content: Parts, calls: TurnPart[]): Parts => content && [...content, ...calls];

type MessageOf<T extends ProcessedMessages["type"]> = Extract<ProcessedMessages, { type: T }>["messages"][number];
type AnthropicBlock = Exclude<MessageOf<"anthropic">["content"], string>[number];
type GenericPart = Exclude<MessageOf<"generic">["content"], string>[number];

const openai = (m: MessageOf<"openai">): Parts => {
  switch (m.role) {
    case "tool":
      return [toolResult(m.tool_call_id, resultOutput(m.content))];
    case "assistant":
      return withCalls(
        textOnly(m.content),
        (m.tool_calls ?? []).map((tc) => toolCall(tc.id, tc.function.name, parseArgs(tc.function.arguments)))
      );
    case "computer_call_output":
      return null;
    default:
      return textOnly(m.content);
  }
};

const anthropicBlock = (b: AnthropicBlock): TurnPart | null => {
  switch (b.type) {
    case "text":
      return text(b.text);
    case "thinking":
      return reasoning(b.thinking);
    case "redacted_thinking":
      return reasoning("[Redacted thinking]");
    case "tool_use":
    case "server_tool_use":
      return toolCall(b.id, b.name, b.input ?? {});
    case "tool_result":
    case "web_search_tool_result":
      return toolResult(b.tool_use_id, resultOutput(b.content));
    default:
      return null;
  }
};

const anthropic = (m: MessageOf<"anthropic">): Parts =>
  typeof m.content === "string" ? textOnly(m.content) : every(m.content.map(anthropicBlock));

const responses = (m: MessageOf<"openai-responses">): Parts => {
  if (m.type === undefined || m.type === "message") return textOnly(m.content);
  switch (m.type) {
    case "reasoning":
      return [reasoning([...(m.summary ?? []), ...(m.content ?? [])].map((p) => p.text).join("\n\n"))];
    case "function_call":
      return [toolCall(m.call_id, m.name, parseArgs(m.arguments))];
    case "custom_tool_call":
      return [toolCall(m.call_id, m.name, m.input)];
    case "function_call_output":
    case "custom_tool_call_output":
      return [toolResult(m.call_id, resultOutput(m.output))];
    default:
      return null;
  }
};

const langchain = (m: MessageOf<"langchain">): Parts => {
  switch (m.role) {
    case "tool":
      return [toolResult(m.tool_call_id, resultOutput(m.content))];
    case "assistant":
    case "ai":
      if (m.invalid_tool_calls?.length) return null;
      return withCalls(
        textOnly(m.content),
        (m.tool_calls ?? []).map((tc) => toolCall(tc.id, tc.name, tc.arguments))
      );
    default:
      return textOnly(m.content);
  }
};

// Gemini calls carry no usable ids, so results match their calls by name.
const gemini = (m: MessageOf<"gemini">): Parts =>
  every(
    m.parts.map((p) => {
      if ("text" in p) return p.thought ? reasoning(p.text) : text(p.text);
      if ("functionCall" in p) return toolCall(undefined, p.functionCall.name, p.functionCall.args ?? {});
      if ("functionResponse" in p) {
        return toolResult(undefined, p.functionResponse.response, p.functionResponse.name);
      }
      return null;
    })
  );

const genericPart = (p: GenericPart): TurnPart | null => {
  switch (p.type) {
    case "text":
      return text(p.text);
    case "reasoning":
      return reasoning(p.text);
    case "tool-call":
      // `args` / `result`: payloads recorded before AI SDK v5 renamed them.
      return toolCall(p.toolCallId, p.toolName, p.input ?? ("args" in p ? p.args : undefined) ?? {});
    case "tool-result": {
      const output = p.output?.type === "text" || p.output?.type === "json" ? p.output.value : p.output;
      return toolResult(p.toolCallId, output ?? ("result" in p ? p.result : undefined), p.toolName);
    }
    default:
      return null;
  }
};

const generic = (m: MessageOf<"generic">): Parts =>
  typeof m.content === "string" ? textOnly(m.content) : every(m.content.map(genericPart));

const PARSERS: { [T in ProcessedMessages["type"]]: (message: MessageOf<T>) => Parts } = {
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
  const message = segment.messages[index];
  const cached = cache.get(message);
  if (cached !== undefined) return cached;
  // TS can't tie `segment.type` to `segment.messages`, though the union guarantees they match.
  const parts = (PARSERS[segment.type] as (message: unknown) => Parts)(message);
  const normalized = parts && { role: segmentMessageRole(segment, index) ?? "assistant", parts };
  cache.set(message, normalized);
  return normalized;
};

type Messages = (NormalizedMessage | null)[];

const matchKey = (part: { id?: string; name?: string }) => part.id ?? (part.name ? `name:${part.name}` : undefined);

/** Each result's call: the earliest unanswered call with its id, or its name when the format has no ids. */
const matchCalls = (messages: Messages): Map<ToolResultPart, ToolCallPart> => {
  const pending = new Map<string, ToolCallPart[]>();
  const matches = new Map<ToolResultPart, ToolCallPart>();
  for (const part of messages.flatMap((message) => message?.parts ?? [])) {
    if (part.kind !== "tool-call" && part.kind !== "tool-result") continue;
    const key = matchKey(part);
    if (!key) continue;
    if (part.kind === "tool-call") pending.set(key, [...(pending.get(key) ?? []), part]);
    else {
      const call = pending.get(key)?.shift();
      if (call) matches.set(part, call);
    }
  }
  return matches;
};

const mapParts = (messages: Messages, fn: (part: TurnPart) => TurnPart[]): Messages =>
  messages.map((message) => message && { ...message, parts: message.parts.flatMap(fn) });

/** Gives each result its call's name and arguments, so a result row can say what it answers. */
export const linkToolResults = (messages: Messages): Messages => {
  const calls = matchCalls(messages);
  return mapParts(messages, (part) => {
    const call = part.kind === "tool-result" && calls.get(part);
    return call && part.kind === "tool-result"
      ? [{ ...part, name: part.name ?? call.name, call: { args: call.args, preview: call.preview } }]
      : [part];
  });
};

/** Moves each result under the call that produced it. Unmatched results stay where they are. */
export const pairToolResults = (messages: Messages): Messages => {
  const matches = matchCalls(messages);
  const results = new Map([...matches].map(([result, call]) => [call, result]));
  return mapParts(messages, (part) => {
    if (part.kind === "tool-result") return matches.has(part) ? [] : [part];
    const result = part.kind === "tool-call" && results.get(part);
    return result && part.kind === "tool-call" ? [{ ...part, result }] : [part];
  });
};
