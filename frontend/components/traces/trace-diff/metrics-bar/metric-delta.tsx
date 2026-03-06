"use client";

const MetricDelta = ({
  icon,
  leftValue,
  rightValue,
  formatValue,
}: {
  icon: React.ReactNode;
  leftValue: number;
  rightValue: number | undefined;
  formatValue: (v: number) => string;
}) => {
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
};

export default MetricDelta;
