import { MetricBreakdownRow } from "@/components/traces/cells/metric-breakdown-row";
import { formatTokensFull, type TokenStats } from "@/lib/traces/format";

interface TokensBreakdownProps {
  stats: TokenStats;
  labelPrefix?: string;
}

function prefixed(base: string, prefix?: string) {
  if (!prefix) return base;
  return `${prefix} ${base.toLowerCase()}`;
}

export function TokensBreakdown({ stats, labelPrefix }: TokensBreakdownProps) {
  const inputTokens = stats.inputTokens ?? 0;
  const outputTokens = stats.outputTokens ?? 0;
  const totalTokens = stats.totalTokens ?? (inputTokens || outputTokens ? inputTokens + outputTokens : 0);

  return (
    <>
      <MetricBreakdownRow label={prefixed("Input tokens", labelPrefix)} value={formatTokensFull(stats.inputTokens)} />
      <MetricBreakdownRow label={prefixed("Output tokens", labelPrefix)} value={formatTokensFull(stats.outputTokens)} />
      <MetricBreakdownRow label={prefixed("Total tokens", labelPrefix)} value={formatTokensFull(totalTokens)} bold />
      {!!stats.cacheReadInputTokens && (
        <MetricBreakdownRow
          label={prefixed("Cache input tokens", labelPrefix)}
          value={formatTokensFull(stats.cacheReadInputTokens)}
          highlight
        />
      )}
      {!!stats.reasoningTokens && (
        <MetricBreakdownRow
          label={prefixed("Reasoning tokens", labelPrefix)}
          value={formatTokensFull(stats.reasoningTokens)}
        />
      )}
    </>
  );
}
