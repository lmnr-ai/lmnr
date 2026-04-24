import { isString } from "lodash";
import { z } from "zod/v4";

import { type ParsedInput, type TextPart } from "@/lib/actions/sessions/parse-input";
import { type ExtractedTool } from "@/lib/actions/spans/previews/tool-detection";
import {
  type OpenAIMessagesSchema,
  OpenAIOutputSchema,
  OpenAITextPartSchema,
  parseOpenAIInput,
  parseOpenAIOutput,
} from "@/lib/spans/types/openai";

import { type ProviderAdapter } from "./types";
import { isBlank, joinNonEmpty } from "./utils";

const parseSystemAndUserOpenAI = (data: unknown): ParsedInput | null => {
  const messages = parseOpenAIInput(data);
  if (!messages) return null;

  let systemText: string | null = null;
  const systemMsg = messages.find((m) => m.role === "system");
  if (systemMsg) {
    if (typeof systemMsg.content === "string") {
      systemText = systemMsg.content;
    } else {
      const textParts = systemMsg.content
        .filter((p): p is z.infer<typeof OpenAITextPartSchema> => p.type === "text")
        .map((p) => p.text);
      if (textParts.length > 0) systemText = textParts.join(" ");
    }
  }

  return { systemText, userParts: extractFirstUserMessage(messages) };
};

const extractFirstUserMessage = (messages: z.infer<typeof OpenAIMessagesSchema>): TextPart[] => {
  for (const msg of messages) {
    if (msg.role !== "user") continue;
    if (typeof msg.content === "string") return [{ text: msg.content }];
    return msg.content
      .filter((p): p is z.infer<typeof OpenAITextPartSchema> => p.type === "text")
      .map((p) => ({ text: p.text }));
  }
  return [];
};

const renderOpenAIMessage = (msg: z.infer<typeof OpenAIMessagesSchema>[number]): string => {
  const content = "content" in msg ? msg.content : null;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return joinNonEmpty(content.map((part) => OpenAITextPartSchema.safeParse(part).data?.text));
};

const renderOutputTextOpenAI = (data: unknown): string | null => {
  const messages = parseOpenAIOutput(data);
  if (!messages) return null;
  return joinNonEmpty(messages.map(renderOpenAIMessage));
};

// The canonical schema types `function.arguments` as a string, but span
// payloads reach us already deep-JSON-parsed. Use a lenient schema that
// accepts either shape so detection still works after deep parsing.
// ---------------------------------------------------------------------------

const LooseOpenAIToolCallSchema = z.looseObject({
  function: z.looseObject({ name: z.string(), arguments: z.unknown() }),
});

const LooseOpenAIAssistantSchema = z.looseObject({
  role: z.literal("assistant"),
  content: z.union([z.string(), z.array(z.unknown()), z.null()]).optional(),
  tool_calls: z.array(LooseOpenAIToolCallSchema).nullable().optional(),
});

const LooseOpenAIChoiceSchema = z.looseObject({ message: LooseOpenAIAssistantSchema });
const LooseOpenAIOutputSchema = z.union([LooseOpenAIChoiceSchema, z.array(LooseOpenAIChoiceSchema)]);

type LooseOpenAIMessage = z.infer<typeof LooseOpenAIAssistantSchema>;

const parseLooseOpenAI = (data: unknown): LooseOpenAIMessage[] | null => {
  const result = LooseOpenAIOutputSchema.safeParse(data);
  if (!result.success) return null;
  const choices = Array.isArray(result.data) ? result.data : [result.data];
  return choices.map((c) => c.message);
};

const openaiHasText = (m: LooseOpenAIMessage): boolean => {
  const c = m.content;
  if (isString(c)) return !isBlank(c);
  if (Array.isArray(c)) {
    return c.some((p) => {
      if (typeof p !== "object" || p === null) return false;
      const part = p as { type?: string; text?: unknown };
      return part.type === "text" && !isBlank(part.text);
    });
  }
  return false;
};

const extractToolsIfToolOnlyOpenAI = (data: unknown): ExtractedTool[] | null => {
  const msgs = parseLooseOpenAI(data);
  if (!msgs || msgs.some(openaiHasText)) return null;
  const tools: ExtractedTool[] = [];
  for (const m of msgs) {
    if (!Array.isArray(m.tool_calls)) continue;
    for (const tc of m.tool_calls) {
      tools.push({ name: tc.function.name, input: tc.function.arguments });
    }
  }
  return tools.length > 0 ? tools : null;
};

// ---------------------------------------------------------------------------

export const openaiAdapter: ProviderAdapter = {
  id: "openai",
  // `detect` intentionally only matches OUTPUT shapes (choice-wrapped),
  // mirroring the original `detectOutputStructure`. Input-shape matching
  // happens through `parseSystemAndUser` independently.
  detect: (data) => OpenAIOutputSchema.safeParse(data).success,
  parseSystemAndUser: parseSystemAndUserOpenAI,
  renderOutputText: renderOutputTextOpenAI,
  extractToolsIfToolOnly: extractToolsIfToolOnlyOpenAI,
};
