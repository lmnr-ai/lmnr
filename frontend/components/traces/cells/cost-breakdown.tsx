import { MetricBreakdownRow } from "@/components/traces/cells/metric-breakdown-row";
import { type CostStats, currencyFormatter } from "@/lib/traces/format";

interface CostBreakdownProps {
  stats: CostStats;
  labelPrefix?: string;
}

function prefixed(base: string, prefix?: string) {
  if (!prefix) return base;
  return `${prefix} ${base.toLowerCase()}`;
}

export function CostBreakdown({ stats, labelPrefix }: CostBreakdownProps) {
  const totalCost = stats.totalCost ?? 0;

  return (
    <>
      <MetricBreakdownRow
        label={prefixed("Input cost", labelPrefix)}
        value={currencyFormatter.format(stats.inputCost ?? 0)}
      />
      <MetricBreakdownRow
        label={prefixed("Output cost", labelPrefix)}
        value={currencyFormatter.format(stats.outputCost ?? 0)}
      />
      <MetricBreakdownRow
        label={prefixed("Total cost", labelPrefix)}
        value={currencyFormatter.format(totalCost)}
        bold
      />
    </>
  );
}
