import { MetricBreakdownRow } from "@/components/traces/cells/metric-breakdown-row";
import { formatTokensFull, prefixedLabel, type TokenStats } from "@/lib/traces/format";

interface TokensBreakdownProps {
  stats: TokenStats;
  labelPrefix?: string;
}

export function TokensBreakdown({ stats, labelPrefix }: TokensBreakdownProps) {
  const inputTokens = stats.inputTokens ?? 0;
  const outputTokens = stats.outputTokens ?? 0;
  const totalTokens = stats.totalTokens ?? (inputTokens || outputTokens ? inputTokens + outputTokens : 0);

  return (
    <>
      {!!stats.cacheReadInputTokens && (
        <MetricBreakdownRow
          label={prefixedLabel("Cache input tokens", labelPrefix)}
          value={formatTokensFull(stats.cacheReadInputTokens)}
          highlight
        />
      )}
      <MetricBreakdownRow
        label={prefixedLabel("Input tokens", labelPrefix)}
        value={formatTokensFull(stats.inputTokens)}
      />
      <MetricBreakdownRow
        label={prefixedLabel("Output tokens", labelPrefix)}
        value={formatTokensFull(stats.outputTokens)}
      />
      <MetricBreakdownRow
        label={prefixedLabel("Total tokens", labelPrefix)}
        value={formatTokensFull(totalTokens)}
        bold
      />
      {!!stats.reasoningTokens && (
        <MetricBreakdownRow
          label={prefixedLabel("Reasoning tokens", labelPrefix)}
          value={formatTokensFull(stats.reasoningTokens)}
        />
      )}
    </>
  );
}
