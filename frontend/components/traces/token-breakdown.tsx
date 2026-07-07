import { useMemo } from "react";

import { getRoleColors } from "@/components/traces/span-view/common";
import { resolveTools } from "@/components/traces/tool-list";
import { Label } from "@/components/ui/label";
import { normalizeToMessages } from "@/lib/spans/types";
import { type Span, SpanType } from "@/lib/traces/types";

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

type BucketKey = "system" | "tools" | "user" | "history";

interface Bucket {
  key: BucketKey;
  label: string;
  color: string;
  tokens: number;
}

const BUCKET_META: Record<BucketKey, { label: string; role: string }> = {
  // Reuse the span-view role palette so segments match the transcript colors.
  system: { label: "System prompt", role: "system" },
  tools: { label: "Tool definitions", role: "tool" },
  user: { label: "User messages", role: "user" },
  history: { label: "History", role: "assistant" },
};

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
const bucketForRole = (role: unknown): Exclude<BucketKey, "tools"> => {
  const r = typeof role === "string" ? role.toLowerCase() : "";
  if (r === "system" || r === "developer") return "system";
  if (r === "user" || r === "human") return "user";
  return "history";
};

// Distribute `total` across `weights` proportionally, guaranteeing the parts
// sum EXACTLY to `total` via the largest-remainder method.
const distribute = (weights: number[], total: number): number[] => {
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
 * Estimate how a span's real `inputTokens` split across system prompt, tool
 * definitions, user messages, and history (assistant + tool results + prior
 * turns). We can't run the model's tokenizer, so we weight each category by
 * character count and distribute the ACTUAL input-token total across all of
 * them proportionally — history included, so system/user aren't inflated.
 */
export const estimateInputBreakdown = (span: Span): Bucket[] | null => {
  if (span.spanType !== SpanType.LLM && span.spanType !== SpanType.CACHED) return null;
  if (!span.inputTokens || span.inputTokens <= 0) return null;

  const normalized = normalizeToMessages(span.input);
  if (!Array.isArray(normalized)) return null;

  const chars: Record<BucketKey, number> = { system: 0, tools: 0, user: 0, history: 0 };
  for (const msg of normalized) {
    chars[bucketForRole((msg as { role?: unknown } | null)?.role)] += contentChars(msg);
  }

  // Tool definitions ride the `tool_definitions` column (resolveTools prefers
  // it, falls back to legacy attributes) — NOT the message array.
  const tools = resolveTools(span);
  if (tools.length > 0) {
    chars.tools = JSON.stringify(tools).length;
  }

  const keys: BucketKey[] = ["system", "tools", "user", "history"];
  const weights = keys.map((k) => chars[k]);
  if (weights.every((w) => w === 0)) return null;

  const tokens = distribute(weights, span.inputTokens);

  return keys
    .map((key, i) => ({
      key,
      label: BUCKET_META[key].label,
      color: getRoleColors(BUCKET_META[key].role).badgeText,
      tokens: tokens[i],
    }))
    .filter((b) => b.tokens > 0);
};

export const InputTokenBreakdown = ({ span }: { span: Span }) => {
  const buckets = useMemo(() => estimateInputBreakdown(span), [span]);

  if (!buckets || buckets.length === 0) {
    return (
      <Label className="flex text-xs gap-1">
        <span className="text-secondary-foreground">Input tokens</span> {numberFormat.format(span.inputTokens || 0)}
      </Label>
    );
  }

  const total = span.inputTokens;
  const cacheRead = span.cacheReadInputTokens ?? 0;
  const uncached = Math.max(0, total - cacheRead);

  return (
    <div className="flex flex-col gap-3 min-w-[220px]">
      <div className="flex justify-between text-xs">
        <span className="text-secondary-foreground">Input tokens</span>
        <span>{numberFormat.format(total)}</span>
      </div>
      {cacheRead > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex w-full h-1 gap-0.5 rounded-full bg-surface-200">
            <div
              className="h-full rounded-full bg-success-bright"
              style={{ flex: cacheRead }}
              title={`Cached: ${numberFormat.format(cacheRead)}`}
            />
            <div
              className="h-full rounded-full"
              style={{ flex: uncached }}
              title={`Uncached: ${numberFormat.format(uncached)}`}
            />
          </div>
          <div className="flex items-center justify-between text-xs gap-4">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px] bg-success-bright" />
              <span className="text-secondary-foreground">Cache input tokens</span>
            </span>
            <span>{numberFormat.format(cacheRead)}</span>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {/* Proportional bar — estimated, colors match the span-view roles. */}
        <div className="flex w-full h-1 gap-0.5">
          {buckets.map((b) => (
            <div
              key={b.key}
              className="h-full rounded-full"
              style={{ flex: b.tokens, backgroundColor: b.color }}
              title={`${b.label}: ${numberFormat.format(b.tokens)}`}
            />
          ))}
        </div>
        <div className="flex flex-col gap-1">
          {buckets.map((b) => (
            <div key={b.key} className="flex items-center justify-between text-xs gap-4">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-[2px]" style={{ backgroundColor: b.color }} />
                <span className="text-secondary-foreground">{b.label}</span>
              </span>
              <span>{numberFormat.format(b.tokens)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
