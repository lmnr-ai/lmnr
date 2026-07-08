import { useMemo } from "react";
import useSWR from "swr";

import { getRoleColors } from "@/components/traces/span-view/common";
import {
  estimateSpanTokenBuckets,
  TOKEN_BUCKET_KEYS,
  type TokenBucketKey,
  type TokenBuckets,
  type TraceTokenBreakdownResponse,
} from "@/lib/spans/token-breakdown";
import { resolveTools } from "@/lib/spans/tools";
import { type Span, SpanType } from "@/lib/traces/types";
import { swrFetcher } from "@/lib/utils";

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

interface DisplayBucket {
  key: string;
  label: string;
  color: string;
  tokens: number;
}

const BUCKET_META: Record<TokenBucketKey, { label: string; role: string }> = {
  // Reuse the span-view role palette so segments match the transcript colors.
  system: { label: "System prompt", role: "system" },
  tools: { label: "Tool definitions", role: "tool" },
  user: { label: "User messages", role: "user" },
  history: { label: "History", role: "assistant" },
};

const toDisplayBuckets = (buckets: TokenBuckets): DisplayBucket[] =>
  TOKEN_BUCKET_KEYS.map((key) => ({
    key,
    label: BUCKET_META[key].label,
    color: getRoleColors(BUCKET_META[key].role).badgeText,
    tokens: buckets[key],
  })).filter((b) => b.tokens > 0);

interface TokenBreakdownPanelProps {
  label?: string;
  total: number;
  cacheRead: number;
  // Null/empty ⇒ fallback: plain input-tokens + cache rows, no bars.
  buckets: DisplayBucket[] | null;
}

/**
 * Dumb tooltip panel: input-token total, cached/uncached bar, and the
 * estimated per-category bar + legend. Data source agnostic — the span
 * wrapper estimates client-side, the trace wrapper fetches a server-side
 * aggregate over all the trace's LLM spans.
 */
export const TokenBreakdownPanel = ({
  label = "Input tokens",
  total,
  cacheRead,
  buckets,
}: TokenBreakdownPanelProps) => {
  if (!buckets || buckets.length === 0) {
    return (
      <div className="flex flex-col gap-1 min-w-[220px]">
        <div className="flex justify-between text-xs gap-4">
          <span className="text-secondary-foreground">{label}</span>
          <span>{numberFormat.format(total)}</span>
        </div>
        {cacheRead > 0 && (
          <div className="flex justify-between text-xs gap-4 text-success-bright">
            <span>Cache input tokens</span>
            <span>{numberFormat.format(cacheRead)}</span>
          </div>
        )}
      </div>
    );
  }

  const uncached = Math.max(0, total - cacheRead);

  return (
    <div className="flex flex-col gap-3 min-w-[220px]">
      <div className="flex justify-between text-xs">
        <span className="text-secondary-foreground">{label}</span>
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

export const InputTokenBreakdown = ({ span }: { span: Span }) => {
  const buckets = useMemo(() => {
    if (span.spanType !== SpanType.LLM && span.spanType !== SpanType.CACHED) return null;
    const estimated = estimateSpanTokenBuckets(span.input, resolveTools(span), span.inputTokens);
    return estimated ? toDisplayBuckets(estimated) : null;
  }, [span]);

  return (
    <TokenBreakdownPanel total={span.inputTokens || 0} cacheRead={span.cacheReadInputTokens ?? 0} buckets={buckets} />
  );
};

interface TraceInputTokenBreakdownProps {
  projectId: string;
  traceId: string;
  inputTokens: number;
  cacheReadInputTokens: number;
}

/**
 * Trace-level breakdown. Payloads never reach the browser — the endpoint runs
 * the same per-span estimator server-side over the trace's LLM spans and
 * returns four numbers. Rendered inside a tooltip, so the fetch only fires on
 * first hover (Radix mounts the content on open) and is SWR-cached after.
 */
export const TraceInputTokenBreakdown = ({
  projectId,
  traceId,
  inputTokens,
  cacheReadInputTokens,
}: TraceInputTokenBreakdownProps) => {
  const { data } = useSWR<TraceTokenBreakdownResponse>(
    `/api/projects/${projectId}/traces/${traceId}/token-breakdown`,
    swrFetcher,
    { revalidateOnFocus: false }
  );

  const buckets = useMemo(() => {
    if (!data) return null;
    const display = toDisplayBuckets(data.buckets);
    if (display.length === 0) return null;
    // Input tokens the estimator couldn't attribute (unparseable inputs,
    // spans beyond the server cap) — keeps the bar honest against the total.
    const other = Math.max(0, inputTokens - data.estimatedInputTokens);
    if (other > 0) {
      display.push({ key: "other", label: "Other", color: "hsl(215, 10%, 45%)", tokens: other });
    }
    return display;
  }, [data, inputTokens]);

  return (
    <TokenBreakdownPanel
      label="Trace input tokens"
      total={inputTokens}
      cacheRead={cacheReadInputTokens}
      buckets={buckets}
    />
  );
};
