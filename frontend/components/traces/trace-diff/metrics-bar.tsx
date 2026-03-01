"use client";

import { CircleDollarSign, Clock3, Coins } from "lucide-react";

import { getDuration } from "@/lib/utils";

import { useTraceDiffStore } from "./trace-diff-store";

function MetricDelta({
  icon,
  leftValue,
  rightValue,
  formatValue,
}: {
  icon: React.ReactNode;
  leftValue: number;
  rightValue: number | undefined;
  formatValue: (v: number) => string;
}) {
  if (rightValue === undefined) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-secondary-foreground bg-muted px-1.5 py-1 rounded-md">
        {icon}
        <span>{formatValue(leftValue)}</span>
      </div>
    );
  }

  const diff = rightValue - leftValue;
  const pctChange = leftValue !== 0 ? ((diff / leftValue) * 100).toFixed(1) : "N/A";
  // Lower is better for all metrics (cost, duration, tokens)
  const isImproved = diff < 0;
  const isRegressed = diff > 0;

  return (
    <div className="flex items-center gap-1.5 text-xs text-secondary-foreground bg-muted px-1.5 py-1 rounded-md">
      {icon}
      <span>{formatValue(leftValue)}</span>
      <span className="text-muted-foreground">&rarr;</span>
      <span>{formatValue(rightValue)}</span>
      {diff !== 0 && pctChange !== "N/A" && (
        <span className={isImproved ? "text-green-300" : isRegressed ? "text-destructive" : ""}>
          {isRegressed ? "\u25B2" : "\u25BC"} {Math.abs(Number(pctChange))}%
        </span>
      )}
    </div>
  );
}

const numberFormatter = new Intl.NumberFormat("en-US", { notation: "compact" });

export default function MetricsBar() {
  const { leftTrace, rightTrace } = useTraceDiffStore((s) => ({
    leftTrace: s.leftTrace,
    rightTrace: s.rightTrace,
  }));

  if (!leftTrace) return null;

  const leftDuration = getDuration(leftTrace.startTime, leftTrace.endTime);
  const rightDuration = rightTrace ? getDuration(rightTrace.startTime, rightTrace.endTime) : undefined;

  return (
    <div className="flex items-center gap-2">
      <MetricDelta
        icon={<Clock3 size={14} />}
        leftValue={leftDuration}
        rightValue={rightDuration}
        formatValue={(v) => `${(v / 1000).toFixed(2)}s`}
      />
      <MetricDelta
        icon={<Coins size={14} />}
        leftValue={leftTrace.totalTokens}
        rightValue={rightTrace?.totalTokens}
        formatValue={(v) => numberFormatter.format(v)}
      />
      <MetricDelta
        icon={<CircleDollarSign size={14} />}
        leftValue={leftTrace.totalCost}
        rightValue={rightTrace?.totalCost}
        formatValue={(v) => `$${v.toFixed(4)}`}
      />
    </div>
  );
}
