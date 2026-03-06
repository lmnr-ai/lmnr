"use client";

import { CircleDollarSign, Clock3, Coins } from "lucide-react";

import { getDuration } from "@/lib/utils";

import { useTraceDiffStore } from "../store";
import MetricDelta from "./metric-delta";

const numberFormatter = new Intl.NumberFormat("en-US", { notation: "compact" });

const MetricsBar = () => {
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
};

export default MetricsBar;
