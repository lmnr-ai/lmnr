import { compact } from "lodash";
import { type z } from "zod/v4";

import { type ParsedInput, type TextPart } from "@/lib/actions/sessions/parse-input";
import {
  OpenAIResponsesItemSchema,
  OpenAIResponsesItemsSchema as ItemsSchema,
  type OpenAIResponsesItemsSchema,
  type OpenAIResponsesMessageItemSchema,
  OpenAIResponsesResponseSchema,
  parseOpenAIResponsesInput,
  parseOpenAIResponsesOutput,
} from "@/lib/spans/types/openai-responses";

import { type ProviderAdapter } from "./types";
import { joinNonEmpty } from "./utils";

type ResponsesItem = z.infer<typeof OpenAIResponsesItemsSchema>[number];
type ResponsesMessageItem = z.infer<typeof OpenAIResponsesMessageItemSchema>;

const isMessageItem = (item: ResponsesItem): item is ResponsesMessageItem =>
  (item as { type?: string }).type === "message" || typeof (item as { role?: unknown }).role === "string";

// ---------------------------------------------------------------------------
// Detection.
//
// Accept either:
//   (a) the full Response object wrapper (`{ object: "response", output: [...] }`)
//   (b) an items array / single item that is *distinctively* Responses-shaped.
//
// Plain chat messages arrays like `[{role:"user",content:"hi"}]` also
// satisfy `OpenAIResponsesItemsSchema` because its message-item variant
// accepts string content. Returning true for those would steal payloads
// from the OpenAI/LangChain/Anthropic adapters. Require at least one
// item with a Responses-only marker (explicit `type`, typed content
// parts, etc.) so that generic chat arrays fall through.
// ---------------------------------------------------------------------------

const RESPONSES_DISTINCTIVE_TYPES = new Set([
  "message",
  "reasoning",
  "function_call",
  "function_call_output",
  "web_search_call",
  "file_search_call",
  "computer_call",
  "computer_call_output",
  "image_generation_call",
  "code_interpreter_call",
  "local_shell_call",
  "local_shell_call_output",
  "mcp_call",
  "mcp_list_tools",
  "mcp_approval_request",
  "mcp_approval_response",
  "item_reference",
  "custom_tool_call",
  "custom_tool_call_output",
]);

const RESPONSES_CONTENT_PART_TYPES = new Set(["input_text", "input_image", "input_file", "output_text", "refusal"]);

const isDistinctivelyResponses = (item: unknown): boolean => {
  if (typeof item !== "object" || item === null) return false;
  const obj = item as { type?: unknown; content?: unknown };
  if (typeof obj.type === "string" && RESPONSES_DISTINCTIVE_TYPES.has(obj.type)) {
    if (obj.type !== "message") return true;
  }
  // Message item: only distinctive if it uses typed Responses content parts.
  if (Array.isArray(obj.content)) {
    return obj.content.some(
      (p) =>
        typeof p === "object" &&
        p !== null &&
        typeof (p as { type?: unknown }).type === "string" &&
        RESPONSES_CONTENT_PART_TYPES.has((p as { type: string }).type)
    );
  }
  return false;
};

const detectResponses = (data: unknown): boolean => {
  if (
    typeof data === "object" &&
    data !== null &&
    !Array.isArray(data) &&
    Array.isArray((data as { output?: unknown }).output) &&
    OpenAIResponsesResponseSchema.safeParse(data).success
  ) {
    return true;
  }

  if (Array.isArray(data)) {
    if (!data.some(isDistinctivelyResponses)) return false;
    return ItemsSchema.safeParse(data).success;
  }

  if (isDistinctivelyResponses(data)) {
    return OpenAIResponsesItemSchema.safeParse(data).success;
  }

  return false;
};

// ---------------------------------------------------------------------------
// parse-input — extract system text + first user message's text parts.
//
// Responses messages carry `content` as either a string or an array of
// typed parts. For user/system inputs the text variant is `input_text`.
// Some SDKs also emit `output_text` on echoed user messages, so accept
// both when collecting text fragments.
// ---------------------------------------------------------------------------

const partText = (part: unknown): string | null => {
  if (typeof part !== "object" || part === null) return null;
  const p = part as { type?: string; text?: unknown };
  if ((p.type === "input_text" || p.type === "output_text") && typeof p.text === "string") return p.text;
  return null;
};

const collectMessageText = (msg: ResponsesMessageItem): string[] => {
  if (typeof msg.content === "string") return compact([msg.content]);
  if (!Array.isArray(msg.content)) return [];
  return compact(msg.content.map(partText));
};

const parseSystemAndUserResponses = (data: unknown): ParsedInput | null => {
  const items = parseOpenAIResponsesInput(data);
  if (!items) return null;

  let systemText: string | null = null;
  let userParts: TextPart[] = [];

  for (const item of items) {
    if (!isMessageItem(item)) continue;
    if (item.role === "system" || item.role === "developer") {
      const texts = collectMessageText(item);
      if (texts.length > 0 && systemText === null) systemText = texts.join("\n");
      continue;
    }
    if (item.role === "user" && userParts.length === 0) {
      userParts = collectMessageText(item).map((text) => ({ text }));
    }
  }

  // If nothing useful was recovered, bail so another adapter can try.
  if (systemText === null && userParts.length === 0) return null;

  return { systemText, userParts };
};

// ---------------------------------------------------------------------------
// provider-keys — render assistant-visible text from an output payload.
//
// The output is a flat items array. For each `message` item we concatenate
// `output_text` (and `input_text` for user echoes) parts. Other item types
// — reasoning, tool calls, tool outputs — don't carry user-visible text.
// ---------------------------------------------------------------------------

const renderOutputTextResponses = (data: unknown): string | null => {
  const items = parseOpenAIResponsesOutput(data);
  if (!items) return null;

  const rendered: string[] = [];
  for (const item of items) {
    if (!isMessageItem(item)) continue;
    const texts = collectMessageText(item);
    if (texts.length > 0) rendered.push(texts.join("\n"));
  }

  if (rendered.length === 0) return null;
  return joinNonEmpty(rendered);
};

// ---------------------------------------------------------------------------

export const openaiResponsesAdapter: ProviderAdapter = {
  id: "openai-responses",
  detect: detectResponses,
  parseSystemAndUser: parseSystemAndUserResponses,
  renderOutputText: renderOutputTextResponses,
  // extractToolsIfToolOnly intentionally omitted for now. Responses
  // represents tool calls as top-level items (function_call,
  // web_search_call, etc.) rather than nested inside an assistant
  // message, so a future implementation would iterate items directly.
};
