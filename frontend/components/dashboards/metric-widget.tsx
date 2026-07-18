import React from "react";

import { type MetricCardConfig } from "@/components/chart-builder/types";

interface MetricWidgetProps {
  data: Record<string, any>[];
  config: MetricCardConfig;
}

/**
 * Formats a numeric value with K / M / B compact suffixes.
 * Non-numeric values are returned as-is.
 */
function formatValue(raw: unknown): string {
  const n = Number(raw);
  if (isNaN(n)) return String(raw ?? "—");
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  // For small decimals keep up to 4 significant figures
  if (n !== 0 && Math.abs(n) < 0.01) return n.toPrecision(4);
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

const MetricWidget = ({ data, config }: MetricWidgetProps) => {
  const row = data[0];
  let displayValue = "—";

  if (row) {
    const key = config.valueKey ?? Object.keys(row)[0];
    displayValue = formatValue(row[key]);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 min-h-0">
      <span className="text-4xl font-semibold tabular-nums leading-none tracking-tight">
        {displayValue}
      </span>
      {config.unit && (
        <span className="text-sm text-muted-foreground">{config.unit}</span>
      )}
    </div>
  );
};

export default MetricWidget;
