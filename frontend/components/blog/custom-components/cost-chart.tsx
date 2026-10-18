import { Children, isValidElement, type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface CostBarProps {
  model: string;
  cost: string;
  highlight?: string;
}

// Marker only: CostChart reads its props to scale every bar against the largest.
export function CostBar(_: CostBarProps) {
  return null;
}

const formatUsd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatRatio = (ratio: number) => `${ratio < 10 ? ratio.toFixed(1) : Math.round(ratio)}×`;

export function CostChart({ title, children }: { title?: string; children: ReactNode }) {
  const bars = Children.toArray(children)
    .filter(isValidElement<CostBarProps>)
    .map(({ props }) => ({ ...props, value: Number(props.cost), isHighlight: props.highlight === "true" }));
  const max = Math.max(...bars.map((b) => b.value), 0);
  const baseline = bars.find((b) => b.isHighlight);

  return (
    <figure className="not-typeset my-8 flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      {title && <figcaption className="text-sm font-medium text-white">{title}</figcaption>}
      {bars.map((bar) => (
        <div key={bar.model} className="grid grid-cols-[120px_1fr] items-center gap-3 sm:grid-cols-[150px_1fr]">
          <span className={cn("truncate text-sm", bar.isHighlight ? "font-medium text-primary" : "text-white")}>
            {bar.model}
          </span>
          <div className="flex items-center gap-2">
            <div
              className={cn("h-5 shrink-0 rounded-sm", bar.isHighlight ? "bg-primary" : "bg-white/25")}
              style={{ width: `max(3px, ${max ? (bar.value / max) * 55 : 0}%)` }}
            />
            <span className="whitespace-nowrap font-mono text-xs text-white">{formatUsd(bar.value)}</span>
            {baseline && !bar.isHighlight && baseline.value > 0 && (
              <span className="whitespace-nowrap text-xs text-secondary-foreground">
                {formatRatio(bar.value / baseline.value)} {baseline.model}
              </span>
            )}
          </div>
        </div>
      ))}
    </figure>
  );
}
