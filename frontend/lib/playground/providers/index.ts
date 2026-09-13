import { type LlmProfileProvider } from "@/lib/actions/llm-profiles/schema";

/** AI SDK `providerOptions` namespace whose thinking settings a profile's models honor. */
export type ThinkingNamespace = "openai" | "anthropic" | "google";

export function thinkingNamespace(provider: LlmProfileProvider | undefined): ThinkingNamespace | null {
  switch (provider) {
    case "openai_completions":
    case "openai_responses":
    case "azure_chat_completions":
    case "azure_responses":
    case "custom":
      return "openai";
    case "anthropic":
    case "azure_anthropic":
      return "anthropic";
    case "gemini":
      return "google";
    default:
      return null;
  }
}

/**
 * Profile models are free text (Azure deployment names, dated Anthropic ids,
 * gateway aliases), so a known model matches when it is the id itself or the
 * longest known id contained in it, e.g. `claude-sonnet-4-5` in
 * `claude-sonnet-4-5-20250929`.
 */
export function matchKnownModel<T extends string>(known: readonly T[], model: string | undefined): T | undefined {
  if (!model) return undefined;
  const needle = model.trim().toLowerCase();
  const exact = known.find((k) => k.toLowerCase() === needle);
  if (exact) return exact;
  return known
    .filter((k) => needle.includes(k.toLowerCase()))
    .sort((a, b) => b.length - a.length)
    .at(0);
}
