import { MetricBreakdownRow } from "@/components/traces/cells/metric-breakdown-row";
import { type CostStats, currencyFormatter, prefixedLabel } from "@/lib/traces/format";

interface CostBreakdownProps {
  stats: CostStats;
  labelPrefix?: string;
}

export function CostBreakdown({ stats, labelPrefix }: CostBreakdownProps) {
  const totalCost = stats.totalCost ?? 0;

  return (
    <>
      <MetricBreakdownRow
        label={prefixedLabel("Input cost", labelPrefix)}
        value={currencyFormatter.format(stats.inputCost ?? 0)}
      />
      <MetricBreakdownRow
        label={prefixedLabel("Output cost", labelPrefix)}
        value={currencyFormatter.format(stats.outputCost ?? 0)}
      />
      <MetricBreakdownRow
        label={prefixedLabel("Total cost", labelPrefix)}
        value={currencyFormatter.format(totalCost)}
        bold
      />
    </>
  );
}
