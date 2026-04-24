import { type z } from "zod/v4";

import { type ParsedInput, type TextPart } from "@/lib/actions/sessions/parse-input";
import { type ExtractedTool } from "@/lib/actions/spans/previews/tool-detection";
import {
  type GeminiContentSchema,
  type GeminiContentsSchema,
  GeminiOutputSchema,
  type GeminiTextPartSchema,
  parseGeminiInput,
  parseGeminiOutput,
} from "@/lib/spans/types/gemini";

import { type ProviderAdapter } from "./types";
import { isBlank, joinNonEmpty } from "./utils";

type GeminiContent = z.infer<typeof GeminiContentSchema>;

const parseSystemAndUserGemini = (data: unknown): ParsedInput | null => {
  const contents = parseGeminiInput(data);
  if (!contents) return null;

  let systemText: string | null = null;
  const systemContent = contents.find((c) => c.role === "system");
  if (systemContent) {
    const textParts = systemContent.parts
      .filter((p): p is z.infer<typeof GeminiTextPartSchema> => "text" in p)
      .map((p) => p.text);
    if (textParts.length > 0) systemText = textParts.join("\n");
  }

  return { systemText, userParts: extractFirstUserMessage(contents) };
};

const extractFirstUserMessage = (contents: z.infer<typeof GeminiContentsSchema>): TextPart[] => {
  for (const content of contents) {
    if (content.role === "user") {
      return content.parts
        .filter((p): p is z.infer<typeof GeminiTextPartSchema> => "text" in p)
        .map((p) => ({ text: p.text }));
    }
  }
  return [];
};

const renderGeminiMessage = (msg: GeminiContent): string =>
  joinNonEmpty(msg.parts.map((part) => ("text" in part ? part.text : null)));

const renderOutputTextGemini = (data: unknown): string | null => {
  const messages = parseGeminiOutput(data);
  if (!messages) return null;
  return joinNonEmpty(messages.map(renderGeminiMessage));
};

const geminiHasText = (contents: GeminiContent[]): boolean =>
  contents.some((c) => c.parts.some((p) => "text" in p && !isBlank(p.text)));

const extractToolsIfToolOnlyGemini = (data: unknown): ExtractedTool[] | null => {
  const contents = parseGeminiOutput(data);
  if (!contents || geminiHasText(contents)) return null;
  const tools: ExtractedTool[] = [];
  for (const c of contents) {
    for (const p of c.parts) {
      if ("functionCall" in p && p.functionCall) {
        tools.push({ name: p.functionCall.name, input: p.functionCall.args ?? {} });
      }
    }
  }
  return tools.length > 0 ? tools : null;
};

// ---------------------------------------------------------------------------

export const geminiAdapter: ProviderAdapter = {
  id: "gemini",
  detect: (data) => GeminiOutputSchema.safeParse(data).success,
  parseSystemAndUser: parseSystemAndUserGemini,
  renderOutputText: renderOutputTextGemini,
  extractToolsIfToolOnly: extractToolsIfToolOnlyGemini,
};
