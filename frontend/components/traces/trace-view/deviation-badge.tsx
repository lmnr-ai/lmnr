import { cn } from "@/lib/utils";

interface DeviationBadgeProps {
  actualMs: number;
  avgMs: number;
  actualCost: number;
  avgCost: number;
  className?: string;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function computeDeviation(actual: number, avg: number): { percent: number; isFaster: boolean } | null {
  if (avg === 0) return null;
  const diff = ((actual - avg) / avg) * 100;
  if (Math.abs(diff) < 1) return null;
  return {
    percent: Math.abs(Math.round(diff)),
    isFaster: diff < 0,
  };
}

export function DeviationBadge({ actualMs, avgMs, actualCost, avgCost, className }: DeviationBadgeProps) {
  const durationDev = avgMs > 0 ? computeDeviation(actualMs, avgMs) : null;
  const costDev = avgCost > 0 ? computeDeviation(actualCost, avgCost) : null;

  if (!durationDev && !costDev) return null;

  return (
    <div className={cn("inline-flex items-center gap-1.5 animate-in fade-in duration-200", className)}>
      {durationDev && (
        <span
          className={cn(
            "inline-flex items-center text-[11px] font-medium px-1.5 py-0.5 rounded-md whitespace-nowrap",
            durationDev.isFaster
              ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
              : "text-orange-600 dark:text-orange-400 bg-orange-500/10"
          )}
        >
          {durationDev.percent}% {durationDev.isFaster ? "faster" : "slower"} than avg {formatDuration(avgMs)}
        </span>
      )}
      {costDev && (
        <span
          className={cn(
            "inline-flex items-center text-[11px] font-medium px-1.5 py-0.5 rounded-md whitespace-nowrap",
            costDev.isFaster
              ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
              : "text-orange-600 dark:text-orange-400 bg-orange-500/10"
          )}
        >
          {costDev.percent}% {costDev.isFaster ? "cheaper" : "pricier"} than avg ${avgCost.toFixed(4)}
        </span>
      )}
    </div>
  );
}
