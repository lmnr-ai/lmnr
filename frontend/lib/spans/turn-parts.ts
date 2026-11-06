import { type ProcessedMessages } from "@/lib/spans/process-messages";
import { segmentMessageRole } from "@/lib/spans/turn";

export type TurnPart =
  | { kind: "text"; text: string }
  | { kind: "reasoning"; text: string }
  | ToolCallPart
  | ToolResultPart;

interface ToolCallPart {
  kind: "tool-call";
  id?: string;
  name: string;
  args: unknown;
  result?: ToolResultPart;
}

export interface ToolResultPart {
  kind: "tool-result";
  id?: string;
  name?: string;
  output: unknown;
  /** The call this result answers, when it can be matched. */
  call?: { args: unknown };
}

export interface NormalizedMessage {
  role: string;
  parts: TurnPart[];
}

const PREVIEW_LENGTH = 240;

/** One-line summary for collapsed rows. Strings are cut before serializing, so big payloads stay cheap. */
export const preview = (value: unknown): string => {
  const json =
    typeof value === "string"
      ? value
      : JSON.stringify(value, (_, v) => (typeof v === "string" ? v.slice(0, PREVIEW_LENGTH) : v));
  return (json ?? String(value))
    .slice(0, PREVIEW_LENGTH * 4)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PREVIEW_LENGTH);
};

/** null: the message holds something these parts can't show (images, files, ...), so its provider renderer takes it. */
type Parts = TurnPart[] | null;

const every = (parts: (TurnPart | null)[]): Parts => (parts.every((part) => part !== null) ? parts : null);

const TEXT_TYPES = new Set(["text", "input_text", "output_text"]);

const textOnly = (content: string | null | undefined | readonly { type: string; text?: unknown }[]): Parts => {
  if (!content) return [];
  if (typeof content === "string") return [{ kind: "text", text: content }];
  return every(
    content.map((p) => (TEXT_TYPES.has(p.type) && typeof p.text === "string" ? { kind: "text", text: p.text } : null))
  );
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
      return [{ kind: "tool-result", id: m.tool_call_id, output: resultOutput(m.content) }];
    case "assistant":
      return withCalls(
        textOnly(m.content),
        (m.tool_calls ?? []).map((tc) => ({
          kind: "tool-call",
          id: tc.id,
          name: tc.function.name,
          args: parseArgs(tc.function.arguments),
        }))
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
      return null;
  }
};

const anthropic = (m: MessageOf<"anthropic">): Parts =>
  typeof m.content === "string" ? textOnly(m.content) : every(m.content.map(anthropicBlock));

const responses = (m: MessageOf<"openai-responses">): Parts => {
  if (m.type === undefined || m.type === "message") return textOnly(m.content);
  switch (m.type) {
    case "reasoning": {
      const text = [...(m.summary ?? []), ...(m.content ?? [])].map((p) => p.text).join("\n\n");
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
      return null;
  }
};

const langchain = (m: MessageOf<"langchain">): Parts => {
  switch (m.role) {
    case "tool":
      return [{ kind: "tool-result", id: m.tool_call_id, output: resultOutput(m.content) }];
    case "assistant":
    case "ai":
      if (m.invalid_tool_calls?.length) return null;
      return withCalls(
        textOnly(m.content),
        (m.tool_calls ?? []).map((tc) => ({ kind: "tool-call", id: tc.id, name: tc.name, args: tc.arguments }))
      );
    default:
      return textOnly(m.content);
  }
};

// Gemini calls carry no usable ids, so results match their calls by name.
const gemini = (m: MessageOf<"gemini">): Parts =>
  every(
    m.parts.map((p): TurnPart | null => {
      if ("text" in p) return { kind: p.thought ? "reasoning" : "text", text: p.text };
      if ("functionCall" in p) return { kind: "tool-call", name: p.functionCall.name, args: p.functionCall.args ?? {} };
      if ("functionResponse" in p) {
        return { kind: "tool-result", name: p.functionResponse.name, output: p.functionResponse.response };
      }
      return null;
    })
  );

const genericPart = (p: GenericPart): TurnPart | null => {
  switch (p.type) {
    case "text":
    case "reasoning":
      return { kind: p.type, text: p.text };
    case "tool-call":
      // `args` / `result`: payloads recorded before AI SDK v5 renamed them.
      return {
        kind: "tool-call",
        id: p.toolCallId,
        name: p.toolName,
        args: p.input ?? ("args" in p ? p.args : undefined) ?? {},
      };
    case "tool-result": {
      const output = p.output?.type === "text" || p.output?.type === "json" ? p.output.value : p.output;
      return {
        kind: "tool-result",
        id: p.toolCallId,
        name: p.toolName,
        output: output ?? ("result" in p ? p.result : undefined),
      };
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

// Keyed by the parsed message object, so toggling context never re-normalizes a message.
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
      ? [{ ...part, name: part.name ?? call.name, call: { args: call.args } }]
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
