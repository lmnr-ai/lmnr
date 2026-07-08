import { normalizeToMessages } from "@/lib/spans/types";

import { type Tool } from "./tools";

export type TokenBucketKey = "system" | "tools" | "user" | "history";

export const TOKEN_BUCKET_KEYS: TokenBucketKey[] = ["system", "tools", "user", "history"];

export type TokenBuckets = Record<TokenBucketKey, number>;

// Wire shape of GET /api/projects/{id}/traces/{id}/token-breakdown. Lives here
// (not in lib/actions) so the client component can import the type — action
// modules are server-only.
export interface TraceTokenBreakdownResponse {
  buckets: TokenBuckets;
  // Sum of input_tokens over spans the estimator could bucket. The trace's
  // remaining input tokens (unparseable inputs, spans beyond the cap) are the
  // caller's "other" share.
  estimatedInputTokens: number;
  truncated: boolean;
}

// Char count of a message's content only (role/keys excluded) — a rough proxy
// for that message's token weight. Non-string content is stringified.
const contentChars = (msg: unknown): number => {
  if (msg == null) return 0;
  const content =
    typeof msg === "object" && msg !== null && "content" in msg ? (msg as { content?: unknown }).content : msg;
  if (content == null) return 0;
  if (typeof content === "string") return content.length;
  try {
    return JSON.stringify(content).length;
  } catch {
    return 0;
  }
};

// system → system, user/human → user, everything else (assistant, tool
// results, model, prior turns) → history.
const bucketForRole = (role: unknown): Exclude<TokenBucketKey, "tools"> => {
  const r = typeof role === "string" ? role.toLowerCase() : "";
  if (r === "system" || r === "developer") return "system";
  if (r === "user" || r === "human") return "user";
  return "history";
};

// Distribute `total` across `weights` proportionally, guaranteeing the parts
// sum EXACTLY to `total` via the largest-remainder method.
export const distribute = (weights: number[], total: number): number[] => {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floored = raw.map(Math.floor);
  let remainder = total - floored.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) {
    floored[order[k].i] += 1;
  }
  return floored;
};

/**
 * Estimate how one span's real `inputTokens` split across system prompt, tool
 * definitions, user messages, and history (assistant + tool results + prior
 * turns). We can't run the model's tokenizer, so we weight each category by
 * character count and distribute the ACTUAL input-token total across all of
 * them proportionally — history included, so system/user aren't inflated.
 *
 * Pure and isomorphic: the span tooltip runs it in the browser on the loaded
 * span; the trace endpoint runs it server-side per LLM span and sums, so the
 * trace numbers are exactly the sum of the span numbers.
 */
export const estimateSpanTokenBuckets = (input: unknown, tools: Tool[], inputTokens: number): TokenBuckets | null => {
  if (!inputTokens || inputTokens <= 0) return null;

  const normalized = normalizeToMessages(input);
  if (!Array.isArray(normalized)) return null;

  const chars: TokenBuckets = { system: 0, tools: 0, user: 0, history: 0 };
  for (const msg of normalized) {
    chars[bucketForRole((msg as { role?: unknown } | null)?.role)] += contentChars(msg);
  }

  if (tools.length > 0) {
    chars.tools = JSON.stringify(tools).length;
  }

  const weights = TOKEN_BUCKET_KEYS.map((k) => chars[k]);
  if (weights.every((w) => w === 0)) return null;

  const tokens = distribute(weights, inputTokens);
  return Object.fromEntries(TOKEN_BUCKET_KEYS.map((k, i) => [k, tokens[i]])) as TokenBuckets;
};
