import { useMemo } from "react";

import { getRoleColors } from "@/components/traces/span-view/common";
import { resolveTools } from "@/components/traces/tool-list";
import { normalizeToMessages } from "@/lib/spans/types";
import { type Span, SpanType } from "@/lib/traces/types";

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const pctOf = (part: number, total: number): number => (total > 0 ? Math.round((part / total) * 100) : 0);

/** Measured count — real provider numbers. */
const MeasuredValue = ({ tokens, pct }: { tokens: number; pct: number }) => (
  <span className="tabular-nums">
    {numberFormat.format(tokens)} <span className="text-secondary-foreground">({pct}%)</span>
  </span>
);

/** Estimated share of input — char-weighted guess, pct only. */
const EstimatedValue = ({ pct }: { pct: number }) => (
  <span className="tabular-nums text-secondary-foreground">{pct}%</span>
);

type BucketKey = "system" | "tools" | "user" | "assistant";

export interface EstimatedBucket {
  key: BucketKey;
  label: string;
  color: string;
  /** Share of input tokens (parts sum to 100). */
  pct: number;
}

export interface TokenBreakdownData {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
  /** Char-weighted split of input; null when input isn't a message array. */
  estimates: EstimatedBucket[] | null;
}

const BUCKET_META: Record<BucketKey, { label: string; role: string }> = {
  // Reuse the span-view role palette so segments match the transcript colors.
  system: { label: "System prompt", role: "system" },
  tools: { label: "Tool definitions", role: "tool" },
  user: { label: "User messages", role: "user" },
  // Catch-all for assistant/model turns and role:tool results (OpenAI-style).
  assistant: { label: "Assistant messages", role: "assistant" },
};

const BUCKET_KEYS: BucketKey[] = ["system", "tools", "user", "assistant"];

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
// results, model) → assistant.
const bucketForRole = (role: unknown): Exclude<BucketKey, "tools"> => {
  const r = typeof role === "string" ? role.toLowerCase() : "";
  if (r === "system" || r === "developer") return "system";
  if (r === "user" || r === "human") return "user";
  return "assistant";
};

// Distribute 100 across `weights` via largest-remainder so parts sum exactly.
const distributePct = (weights: number[]): number[] => {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (100 * w) / sum);
  const floored = raw.map(Math.floor);
  let remainder = 100 - floored.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) {
    floored[order[k].i] += 1;
  }
  return floored;
};

const estimateShares = (span: Span): EstimatedBucket[] | null => {
  if (!span.inputTokens || span.inputTokens <= 0) return null;

  const normalized = normalizeToMessages(span.input);
  if (!Array.isArray(normalized)) return null;

  const chars: Record<BucketKey, number> = { system: 0, tools: 0, user: 0, assistant: 0 };
  for (const msg of normalized) {
    chars[bucketForRole((msg as { role?: unknown } | null)?.role)] += contentChars(msg);
  }

  // Tool definitions ride the `tool_definitions` column (resolveTools prefers
  // it, falls back to legacy attributes) — NOT the message array.
  const tools = resolveTools(span);
  if (tools.length > 0) {
    chars.tools = JSON.stringify(tools).length;
  }

  const weights = BUCKET_KEYS.map((k) => chars[k]);
  if (weights.every((w) => w === 0)) return null;

  const pcts = distributePct(weights);
  return BUCKET_KEYS.map((key, i) => ({
    key,
    label: BUCKET_META[key].label,
    color: getRoleColors(BUCKET_META[key].role).badgeText,
    pct: pcts[i],
  })).filter((b) => b.pct > 0);
};

/**
 * Measured token counts from the span, plus an optional char-weighted estimate
 * of how input tokens split across system / tools / user / assistant.
 */
export const getTokenBreakdown = (span: Span): TokenBreakdownData | null => {
  if (span.spanType !== SpanType.LLM && span.spanType !== SpanType.CACHED) return null;

  const inputTokens = span.inputTokens || 0;
  const outputTokens = span.outputTokens || 0;
  const totalTokens = span.totalTokens || inputTokens + outputTokens;
  if (totalTokens <= 0 && inputTokens <= 0) return null;

  return {
    inputTokens,
    outputTokens,
    totalTokens: totalTokens || inputTokens + outputTokens,
    cacheReadTokens: span.cacheReadInputTokens ?? 0,
    reasoningTokens: span.reasoningTokens ?? 0,
    estimates: estimateShares(span),
  };
};

export const InputTokenBreakdown = ({ span }: { span: Span }) => {
  const data = useMemo(() => getTokenBreakdown(span), [span]);

  if (!data) {
    const cacheReadFallback = span.cacheReadInputTokens ?? 0;
    const reasoningFallback = span.reasoningTokens ?? 0;
    return (
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs gap-4">
          <span className="text-secondary-foreground">Input tokens</span>
          <span className="tabular-nums">{numberFormat.format(span.inputTokens || 0)}</span>
        </div>
        <div className="flex justify-between text-xs gap-4">
          <span className="text-secondary-foreground">Output tokens</span>
          <span className="tabular-nums">{numberFormat.format(span.outputTokens || 0)}</span>
        </div>
        {reasoningFallback > 0 && (
          <div className="flex justify-between text-xs gap-4">
            <span className="text-secondary-foreground">Reasoning tokens</span>
            <span className="tabular-nums">{numberFormat.format(reasoningFallback)}</span>
          </div>
        )}
        {cacheReadFallback > 0 && (
          <div className="flex justify-between text-xs gap-4 text-success-bright">
            <span>Cache input tokens</span>
            <span className="tabular-nums">{numberFormat.format(cacheReadFallback)}</span>
          </div>
        )}
      </div>
    );
  }

  const { inputTokens, outputTokens, cacheReadTokens, reasoningTokens, estimates } = data;
  const uncached = Math.max(0, inputTokens - cacheReadTokens);

  return (
    <div className="flex flex-col gap-3 min-w-[220px]">
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs gap-4">
          <span className="text-secondary-foreground">Input tokens</span>
          <span className="tabular-nums">{numberFormat.format(inputTokens)}</span>
        </div>
        {cacheReadTokens > 0 && (
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex w-full h-1 gap-0.5 rounded-full bg-surface-200">
              <div
                className="h-full rounded-full bg-success-bright"
                style={{ flex: cacheReadTokens }}
                title={`Cached: ${numberFormat.format(cacheReadTokens)} (${pctOf(cacheReadTokens, inputTokens)}%)`}
              />
              <div
                className="h-full rounded-full"
                style={{ flex: uncached }}
                title={`Uncached: ${numberFormat.format(uncached)} (${pctOf(uncached, inputTokens)}%)`}
              />
            </div>
            <div className="flex items-center justify-between text-xs gap-4">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-[2px] bg-success-bright" />
                <span className="text-secondary-foreground">Cache input tokens</span>
              </span>
              <MeasuredValue tokens={cacheReadTokens} pct={pctOf(cacheReadTokens, inputTokens)} />
            </div>
          </div>
        )}
      </div>

      {estimates && estimates.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex w-full h-1 gap-0.5">
            {estimates.map((b) => (
              <div
                key={b.key}
                className="h-full rounded-full"
                style={{ flex: b.pct, backgroundColor: b.color }}
                title={`${b.label}: ${b.pct}%`}
              />
            ))}
          </div>
          <div className="flex flex-col gap-1">
            {estimates.map((b) => (
              <div key={b.key} className="flex items-center justify-between text-xs gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-[2px]" style={{ backgroundColor: b.color }} />
                  <span className="text-secondary-foreground">{b.label}</span>
                </span>
                <EstimatedValue pct={b.pct} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1 border-t pt-2">
        <div className="flex justify-between text-xs gap-4">
          <span className="text-secondary-foreground">Output tokens</span>
          <MeasuredValue tokens={outputTokens} pct={pctOf(outputTokens, inputTokens)} />
        </div>
        {reasoningTokens > 0 && (
          <div className="flex justify-between text-xs gap-4">
            <span className="text-secondary-foreground">Reasoning tokens</span>
            <MeasuredValue tokens={reasoningTokens} pct={pctOf(reasoningTokens, inputTokens)} />
          </div>
        )}
      </div>
    </div>
  );
};
