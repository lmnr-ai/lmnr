import { isString } from "lodash";
import { type z } from "zod/v4";

import { type ExtractedTool } from "@/lib/actions/spans/previews/tool-detection";
import {
  LangChainAssistantMessageSchema,
  LangChainMessagesSchema,
  LangChainTextPartSchema,
} from "@/lib/spans/types/langchain";

import { type ProviderAdapter } from "./types";
import { isBlank, joinNonEmpty } from "./utils";

type LangChainAssistant = z.infer<typeof LangChainAssistantMessageSchema>;

// ---------------------------------------------------------------------------
// LangChain has no dedicated output schema. We treat any payload that
// validates as an assistant message (or an array of messages containing at
// least one assistant/ai role) as a LangChain output.
// ---------------------------------------------------------------------------

const detectLangChain = (data: unknown): boolean => {
  if (LangChainAssistantMessageSchema.safeParse(data).success) return true;
  if (Array.isArray(data) && LangChainMessagesSchema.safeParse(data).success) return true;
  return false;
};

const parseLangChainAssistants = (data: unknown): LangChainAssistant[] | null => {
  const singleInput = Array.isArray(data) && data.length === 1 ? data[0] : data;
  const single = LangChainAssistantMessageSchema.safeParse(singleInput);
  if (single.success) return [single.data];
  const multi = LangChainMessagesSchema.safeParse(data);
  if (!multi.success) return null;
  return multi.data.filter((m): m is LangChainAssistant => m.role === "assistant" || m.role === "ai");
};

const renderLangChainMessage = (msg: LangChainAssistant): string => {
  if (typeof msg.content === "string") return msg.content;
  if (!Array.isArray(msg.content)) return "";
  return joinNonEmpty(msg.content.map((part) => LangChainTextPartSchema.safeParse(part).data?.text));
};

const renderOutputTextLangChain = (data: unknown): string | null => {
  const single = LangChainAssistantMessageSchema.safeParse(Array.isArray(data) && data.length === 1 ? data[0] : data);
  if (single.success) return renderLangChainMessage(single.data);

  const multi = LangChainMessagesSchema.safeParse(data);
  if (!multi.success) return null;
  const assistants = multi.data.filter((m): m is LangChainAssistant => m.role === "assistant" || m.role === "ai");
  return assistants.length > 0 ? joinNonEmpty(assistants.map(renderLangChainMessage)) : null;
};

const langchainHasText = (msgs: LangChainAssistant[]): boolean =>
  msgs.some((m) => {
    const c = m.content;
    if (isString(c)) return !isBlank(c);
    if (Array.isArray(c)) {
      return c.some((p) => typeof p === "object" && p !== null && "type" in p && p.type === "text" && !isBlank(p.text));
    }
    return false;
  });

const extractToolsIfToolOnlyLangChain = (data: unknown): ExtractedTool[] | null => {
  const msgs = parseLangChainAssistants(data);
  if (!msgs || langchainHasText(msgs)) return null;
  const tools: ExtractedTool[] = [];
  for (const m of msgs) {
    if (!Array.isArray(m.tool_calls)) continue;
    for (const tc of m.tool_calls) {
      tools.push({ name: tc.name, input: tc.arguments });
    }
  }
  return tools.length > 0 ? tools : null;
};

export const langchainAdapter: ProviderAdapter = {
  id: "langchain",
  detect: detectLangChain,
  // Intentionally omits parseSystemAndUser: LangChain request payloads
  // were never handled by parse-input, and the session grouping pipeline
  // doesn't rely on it. Can be added later if needed.
  renderOutputText: renderOutputTextLangChain,
  extractToolsIfToolOnly: extractToolsIfToolOnlyLangChain,
};
