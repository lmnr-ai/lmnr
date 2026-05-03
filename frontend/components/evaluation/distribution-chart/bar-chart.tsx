import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { type EvaluationScoreAnalysis, type EvaluationScoreBin } from "@/lib/evaluation/types";

import { continuousThresholdPosition } from "./utils";

type BarRow = EvaluationScoreBin & { binIndex: number };

interface DistributionBarChartProps {
  analysis: EvaluationScoreAnalysis;
  scoreName: string;
  selectedBinIndex: number | null;
  onBinClick: (bin: EvaluationScoreBin, index: number) => void;
}

const PASS_COLOR = "hsl(var(--success))";
const FAIL_COLOR = "hsl(var(--destructive))";
const NEUTRAL_COLOR = "hsl(var(--chart-1))";
const DIM = "0.35";
const SOLID = "1";

const chartConfig = {
  count: { color: NEUTRAL_COLOR },
};

function fillForBin(bin: EvaluationScoreBin): string {
  if (bin.isPass == null) return NEUTRAL_COLOR;
  return bin.isPass ? PASS_COLOR : FAIL_COLOR;
}

export default function DistributionBarChart({
  analysis,
  scoreName,
  selectedBinIndex,
  onBinClick,
}: DistributionBarChartProps) {
  const data: BarRow[] = analysis.bins.map((bin, i) => ({ ...bin, binIndex: i }));

  // For continuous scores, draw a threshold line at the exact numeric
  // position. recharts' ReferenceLine on a categorical XAxis takes the
  // category value (here: the bin label), so we interpolate between bin
  // boundaries and render at the nearest bin — approximating the true
  // position within that bin via a custom `x` offset isn't supported
  // without dropping to SVG, so we round to the bin boundary the
  // threshold crosses. Good enough for the "threshold X" annotation
  // described in the task spec.
  const continuousThresholdLabel =
    analysis.type === "continuous" && analysis.passThreshold != null
      ? (() => {
          const pos = continuousThresholdPosition(analysis.passThreshold, analysis.bins);
          if (pos == null) return null;
          // index of the bin to the RIGHT of the threshold (so the line
          // sits at the left edge of that bin).
          const idx = analysis.bins.findIndex((b, i) => {
            if (i === analysis.bins.length - 1) return b.upperBound >= analysis.passThreshold!;
            return b.upperBound > analysis.passThreshold!;
          });
          if (idx <= 0) return null;
          return analysis.bins[idx].label;
        })()
      : null;

  return (
    <ChartContainer config={chartConfig} className="h-48 w-full">
      <BarChart
        accessibilityLayer
        data={data}
        margin={{ top: 16, right: 12, left: 0, bottom: 0 }}
        onClick={(state: any) => {
          // recharts click surface is the chart itself; activeTooltipIndex
          // gives us the hovered bin reliably even for tiny bars.
          if (state?.activeTooltipIndex != null) {
            const idx = state.activeTooltipIndex as number;
            const bin = analysis.bins[idx];
            if (bin) onBinClick(bin, idx);
          }
        }}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={true}
          padding={{ left: 8, right: 8 }}
          tickMargin={6}
          interval={0}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickCount={3}
          allowDecimals={false}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
        />
        <ChartTooltip
          cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
          content={
            <ChartTooltipContent
              labelFormatter={(label) => (
                <span className="text-foreground font-medium">
                  {scoreName} = {String(label)}
                </span>
              )}
              formatter={(value: any) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="text-muted-foreground">datapoints</span>
                  <span className="font-mono font-medium tabular-nums">
                    {typeof value === "number" ? value.toLocaleString() : String(value)}
                  </span>
                </div>
              )}
            />
          }
        />
        {continuousThresholdLabel != null && (
          <ReferenceLine
            x={continuousThresholdLabel}
            stroke="hsl(var(--foreground))"
            strokeDasharray="4 4"
            strokeWidth={1}
            label={{
              value: `threshold ${analysis.passThreshold}`,
              position: "top",
              fill: "hsl(var(--foreground))",
              fontSize: 10,
            }}
          />
        )}
        <Bar dataKey="count" radius={4} style={{ cursor: "pointer" }} isAnimationActive={false}>
          {data.map((row) => (
            <Cell
              key={row.binIndex}
              fill={fillForBin(row)}
              fillOpacity={selectedBinIndex == null || selectedBinIndex === row.binIndex ? SOLID : DIM}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
