import { findAdapter, PROVIDERS } from "@/lib/spans/providers";

import { type ProviderHint } from "./utils";

export interface ExtractedTool {
  name: string;
  input: unknown;
}

/**
 * If an LLM output has tool calls but no visible text/thinking, return
 * all tool blocks as `{ name, input }` pairs so the caller can route
 * them through the preview pipeline individually. Returns null when no
 * provider matches or the output has displayable text.
 *
 * Pass `hint` from `detectOutputStructure` to skip non-matching parsers.
 */
export const extractToolsIfToolOnly = (data: unknown, hint?: ProviderHint): ExtractedTool[] | null => {
  const hinted = findAdapter(hint);
  if (hinted?.extractToolsIfToolOnly) {
    const tools = hinted.extractToolsIfToolOnly(data);
    if (tools) return tools;
    // When a hint is supplied we trust it: if that adapter says "not
    // tool-only" (null), don't fall through to others.
    return null;
  }

  for (const adapter of PROVIDERS) {
    const tools = adapter.extractToolsIfToolOnly?.(data);
    if (tools) return tools;
  }
  return null;
};
