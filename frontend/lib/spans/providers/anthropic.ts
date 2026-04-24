import { isString } from "lodash";
import { type z } from "zod/v4";

import { type ParsedInput, type TextPart } from "@/lib/actions/sessions/parse-input";
import { type ExtractedTool } from "@/lib/actions/spans/previews/tool-detection";
import {
  type AnthropicContentBlockSchema,
  type AnthropicMessagesSchema,
  AnthropicOutputMessageSchema,
  AnthropicOutputMessagesSchema,
  AnthropicTextBlockSchema,
  AnthropicThinkingBlockSchema,
  parseAnthropicInput,
  parseAnthropicOutput,
} from "@/lib/spans/types/anthropic";

import { type ProviderAdapter } from "./types";
import { isBlank, joinNonEmpty } from "./utils";

type AnthropicMessage = z.infer<typeof AnthropicMessagesSchema>[number];
type AnthropicBlock = z.infer<typeof AnthropicContentBlockSchema>;

const parseSystemAndUserAnthropic = (data: unknown): ParsedInput | null => {
  const messages = parseAnthropicInput(data);
  if (!messages) return null;

  let systemText: string | null = null;
  const systemMsg = messages.find((m) => m.role === "system");
  if (systemMsg) {
    if (typeof systemMsg.content === "string") {
      systemText = systemMsg.content;
    } else {
      const textBlocks = (systemMsg.content as AnthropicBlock[]).filter(
        (b): b is { type: "text"; text: string } => b.type === "text"
      );
      if (textBlocks.length > 0) systemText = textBlocks.map((b) => b.text).join(" ");
    }
  }

  return { systemText, userParts: extractFirstUserMessage(messages) };
};

const extractFirstUserMessage = (messages: AnthropicMessage[]): TextPart[] => {
  for (const msg of messages) {
    if (msg.role !== "user") continue;
    if (typeof msg.content === "string") return [{ text: msg.content }];
    return (msg.content as AnthropicBlock[])
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => ({ text: b.text }));
  }
  return [];
};

const renderAnthropicMessage = (msg: { content: unknown }): string => {
  if (typeof msg.content === "string") return msg.content;
  if (!Array.isArray(msg.content)) return "";
  return joinNonEmpty(
    msg.content.map(
      (block) =>
        AnthropicThinkingBlockSchema.safeParse(block).data?.thinking ??
        AnthropicTextBlockSchema.safeParse(block).data?.text
    )
  );
};

const renderOutputTextAnthropic = (data: unknown): string | null => {
  const messages = parseAnthropicOutput(data);
  if (!messages) return null;
  return joinNonEmpty(messages.map(renderAnthropicMessage));
};

const anthropicIsTool = (b: AnthropicBlock): boolean => b.type === "tool_use" || b.type === "server_tool_use";

const anthropicHasText = (msgs: AnthropicMessage[]): boolean =>
  msgs.some((m) => {
    if (!Array.isArray(m.content)) return isString(m.content) && !isBlank(m.content);
    return m.content.some((b) => {
      if (b.type === "text") return !isBlank(b.text);
      if (b.type === "thinking") return !isBlank(b.thinking);
      return false;
    });
  });

const extractToolsIfToolOnlyAnthropic = (data: unknown): ExtractedTool[] | null => {
  const msgs = parseAnthropicOutput(data);
  if (!msgs || anthropicHasText(msgs)) return null;
  const tools: ExtractedTool[] = [];
  for (const m of msgs) {
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content) {
      if (anthropicIsTool(b) && (b.type === "tool_use" || b.type === "server_tool_use")) {
        tools.push({ name: b.name, input: b.input });
      }
    }
  }
  return tools.length > 0 ? tools : null;
};

// ---------------------------------------------------------------------------

export const anthropicAdapter: ProviderAdapter = {
  id: "anthropic",
  detect: (data) =>
    AnthropicOutputMessageSchema.safeParse(data).success || AnthropicOutputMessagesSchema.safeParse(data).success,
  parseSystemAndUser: parseSystemAndUserAnthropic,
  renderOutputText: renderOutputTextAnthropic,
  extractToolsIfToolOnly: extractToolsIfToolOnlyAnthropic,
};
