import { type ExtractedTool, type ParsedInput } from "@/lib/spans/providers/message-types";
import { matchOpenCodeMessages, type OpenCodeMessage } from "@/lib/spans/types/opencode";

import { type ProviderAdapter } from "./types";
import { joinNonEmpty } from "./utils";

const texts = (message: OpenCodeMessage | undefined, type = "text"): string[] =>
  (message?.content ?? []).flatMap((p) => (p.type === type && "text" in p && p.text ? [p.text as string] : []));

const parseSystemAndUser = (data: unknown): ParsedInput | null => {
  const messages = matchOpenCodeMessages(data);
  if (!messages) return null;
  const systemText = texts(messages.find((m) => m.role === "system")).join(" ") || null;
  const userParts = texts(messages.find((m) => m.role === "user")).map((text) => ({ text }));
  return { systemText, userParts };
};

const renderOutputText = (data: unknown): string | null => {
  const messages = matchOpenCodeMessages(data);
  if (!messages) return null;
  return joinNonEmpty(messages.map((m) => joinNonEmpty(texts(m).length > 0 ? texts(m) : texts(m, "reasoning"))));
};

const extractToolsIfToolOnly = (data: unknown): ExtractedTool[] | null => {
  const messages = matchOpenCodeMessages(data);
  if (!messages || messages.some((m) => texts(m).length > 0 || texts(m, "reasoning").length > 0)) return null;
  const tools = messages.flatMap((m) =>
    m.content.flatMap((p) =>
      p.type === "tool-call" && "name" in p ? [{ name: p.name as string, input: p.input }] : []
    )
  );
  return tools.length > 0 ? tools : null;
};

export const opencodeAdapter: ProviderAdapter = {
  id: "opencode",
  detect: (data) => matchOpenCodeMessages(data) !== null,
  parseSystemAndUser,
  renderOutputText,
  extractToolsIfToolOnly,
};
