import { type ParsedInput } from "@/lib/actions/sessions/parse-input";
import { type ExtractedTool } from "@/lib/actions/spans/previews/tool-detection";

/**
 * Canonical provider identifiers. Keep the list in sync with `PROVIDERS`
 * in `./index.ts` — adding a new adapter means extending both.
 */
export type ProviderHint =
  | "openai"
  | "openai-responses"
  | "anthropic"
  | "gemini"
  | "langchain"
  | "gen-ai"
  | "unknown";

/**
 * A provider adapter encapsulates everything we need to know about a
 * message format so the rest of the codebase can dispatch generically.
 *
 * Every capability is optional: an adapter implements only what it
 * supports. Dispatch sites must tolerate missing capabilities.
 */
export interface ProviderAdapter {
  id: Exclude<ProviderHint, "unknown">;

  /** Structural detection — does this payload look like this provider? */
  detect(data: unknown): boolean;

  /**
   * parse-input.ts: extract the system text + first user message's text
   * parts from a request-style payload. Returns null if this adapter
   * cannot parse the payload.
   */
  parseSystemAndUser?(data: unknown): ParsedInput | null;

  /**
   * provider-keys.ts: render assistant-visible text from an output
   * payload. Returns null when the payload isn't an output for this
   * provider (or has no renderable text).
   */
  renderOutputText?(data: unknown): string | null;

  /**
   * tool-detection.ts: when an LLM output has tool calls but no visible
   * text/thinking, return the tool calls so the caller can route them
   * through the preview pipeline. Returns null when the output has
   * displayable text or isn't from this provider.
   */
  extractToolsIfToolOnly?(data: unknown): ExtractedTool[] | null;
}
