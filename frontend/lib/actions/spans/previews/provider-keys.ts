import { findAdapter, PROVIDERS } from "@/lib/spans/providers";

import { type ProviderHint } from "./utils.ts";

/**
 * A match resolves the span preview to rendered text. All provider
 * matchers go through their respective Zod schemas, so no ad-hoc
 * structural checks or Mustache templates are needed here.
 */
export interface ProviderKeyMatch {
  rendered: string;
}

/**
 * Render user-visible text from an LLM output payload using the
 * provider registry. When `providerHint` is supplied, try that adapter
 * first; on miss, iterate the full list.
 *
 * Adding support for a new format is a matter of implementing
 * `renderOutputText` on the corresponding adapter — no change here.
 */
export const matchProviderKey = (data: unknown, providerHint?: ProviderHint): ProviderKeyMatch | null => {
  // Hint fast-path — try the named adapter first. Any structural match
  // (including empty text) wins; the caller re-checks emptiness, so we
  // mirror the original `patterns` iteration semantics here.
  const hinted = findAdapter(providerHint);
  if (hinted?.renderOutputText) {
    const rendered = hinted.renderOutputText(data);
    if (rendered !== null) return { rendered };
  }

  for (const adapter of PROVIDERS) {
    const rendered = adapter.renderOutputText?.(data);
    if (rendered !== null && rendered !== undefined) return { rendered };
  }
  return null;
};
