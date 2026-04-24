import { anthropicAdapter } from "./anthropic";
import { geminiAdapter } from "./gemini";
import { genAIAdapter } from "./gen-ai";
import { langchainAdapter } from "./langchain";
import { openaiAdapter } from "./openai";
import { openaiResponsesAdapter } from "./openai-responses";
import { type ProviderAdapter, type ProviderHint } from "./types";

export { type ProviderAdapter, type ProviderHint } from "./types";

/**
 * Registry of known message-format adapters. Order matters: dispatch
 * sites iterate this list and pick the first match.
 *
 * GenAI (OTel semconv) runs first because its `{role, parts: [...]}` shape
 * can incidentally match the optional-content OpenAI assistant schema and
 * be misparsed as an empty OpenAI message. The GenAI detect is gated on
 * a GenAI type discriminator so it won't false-positive on OpenAI/Gemini.
 *
 * Keep OpenAI Chat ahead of OpenAI Responses so a plain chat-completions
 * payload isn't accidentally matched as a Responses item. Keep Anthropic
 * after OpenAI so ambiguous shapes prefer the more common provider —
 * call sites that need to prioritise Anthropic (e.g. span-view message
 * rendering) still do their own signal check before consulting this list.
 *
 * Adding a new provider = one new file in `lib/spans/providers/` + one
 * line below.
 */
export const PROVIDERS: readonly ProviderAdapter[] = [
  genAIAdapter,
  openaiAdapter,
  openaiResponsesAdapter,
  anthropicAdapter,
  geminiAdapter,
  langchainAdapter,
];

/**
 * Structurally detect which provider a payload belongs to. Returns
 * `"unknown"` if no adapter's `detect` matches.
 */
export const detectProvider = (data: unknown): ProviderHint => {
  for (const p of PROVIDERS) {
    if (p.detect(data)) return p.id;
  }
  return "unknown";
};

/**
 * Resolve an adapter by hint. Returns null for `undefined` / `"unknown"`
 * / unknown ids.
 */
export const findAdapter = (hint: ProviderHint | undefined): ProviderAdapter | null => {
  if (!hint || hint === "unknown") return null;
  return PROVIDERS.find((p) => p.id === hint) ?? null;
};

/**
 * Find system-message text within an LLM input payload. Iterates each
 * adapter's `parseSystemAndUser` and returns the first non-null,
 * non-empty `systemText`.
 *
 * Callers pass the already-JSON-parsed payload (array or single item).
 * Adding a new provider = implement `parseSystemAndUser` — this function
 * picks it up automatically.
 */
export const extractSystemText = (data: unknown): string | null => {
  for (const adapter of PROVIDERS) {
    const parsed = adapter.parseSystemAndUser?.(data);
    if (parsed?.systemText) return parsed.systemText;
  }
  return null;
};
