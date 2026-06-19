"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, Text, XAxis, YAxis } from "recharts";
import useSWR from "swr";

import { formatScoreValue } from "@/components/evaluation/utils.ts";
import { Button } from "@/components/ui/button";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { type EvaluationDatapointComparisonRow } from "@/lib/actions/evaluation";
import { type Evaluation as EvaluationType } from "@/lib/evaluation/types";
import { cn, formatTimestamp, swrFetcher } from "@/lib/utils";

interface DatapointRunsChartProps {
  projectId: string;
  index: number;
  evaluations: EvaluationType[];
  currentTraceId?: string;
  scoreNames: string[];
  selectedScore?: string;
  onSelectScore: (score: string) => void;
  onSelectTrace: (traceId: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

type RunPoint = {
  evaluationId: string;
  traceId: string;
  name: string;
  createdAt: string;
  value: number | null;
  isCurrent: boolean;
};

const CHART_CONFIG: ChartConfig = { value: { color: "hsl(var(--chart-1))" } };

const shortTime = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
};

export default function DatapointRunsChart({
  projectId,
  index,
  evaluations,
  currentTraceId,
  scoreNames,
  selectedScore,
  onSelectScore,
  onSelectTrace,
  collapsed,
  onToggleCollapse,
}: DatapointRunsChartProps) {
  const activeScore = selectedScore && scoreNames.includes(selectedScore) ? selectedScore : scoreNames[0];

  const url = useMemo(() => {
    const ids = evaluations.map((e) => e.id).join(",");
    return `/api/projects/${projectId}/evaluations/datapoint-comparison?evaluationIds=${ids}&index=${index}`;
  }, [projectId, evaluations, index]);

  const { data, isLoading, error } = useSWR<{ rows: EvaluationDatapointComparisonRow[] }>(url, swrFetcher, {
    revalidateOnFocus: false,
  });

  const points = useMemo<RunPoint[]>(() => {
    const evalById = new Map(evaluations.map((e) => [e.id, e]));
    // Dedup by evaluationId (RMT may surface pre-merge duplicates); keep the last seen.
    const byEval = new Map<string, EvaluationDatapointComparisonRow>();
    (data?.rows ?? []).forEach((r) => byEval.set(r.evaluationId, r));
    return Array.from(byEval.values())
      .map((r) => {
        const ev = evalById.get(r.evaluationId);
        const v = activeScore ? r.scores[activeScore] : undefined;
        return {
          evaluationId: r.evaluationId,
          traceId: r.traceId,
          name: ev?.name ?? "—",
          createdAt: ev?.createdAt ?? "",
          value: typeof v === "number" && Number.isFinite(v) ? v : null,
          isCurrent: !!currentTraceId && r.traceId === currentTraceId,
        };
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [data, evaluations, activeScore, currentTraceId]);

  if (isLoading && !collapsed) {
    return (
      <div className="flex-none border-b px-5 py-4">
        <Skeleton className="h-[120px] w-full rounded-[4px]" />
      </div>
    );
  }

  // Best-effort enhancement: on error or when there's nothing to compare
  // (only the current run has this datapoint), don't take up header space.
  if (error || points.length < 2) return null;

  const horizontalPadding = Math.max(6 - points.length, 0) * 80;
  const currentRun = points.find((p) => p.isCurrent);

  return (
    <div className={cn("flex flex-col border-b px-4 py-2")}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-secondary-foreground truncate">
          Comparing row #{index} across {points.length} runs
        </span>
        <div className="flex flex-none items-center gap-2">
          {!collapsed && scoreNames.length > 1 && (
            <Select value={activeScore} onValueChange={onSelectScore}>
              <SelectTrigger className="h-6 w-[140px] text-xs bg-secondary flex-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scoreNames.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {onToggleCollapse && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-secondary-foreground"
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Show run comparison" : "Hide run comparison"}
            >
              {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
            </Button>
          )}
        </div>
      </div>
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="h-44 pt-2">
            <ChartContainer config={CHART_CONFIG} className="aspect-auto h-full w-full">
              <LineChart margin={{ top: 12, right: 16, bottom: 4, left: 8 }} data={points} accessibilityLayer>
                <XAxis
                  dataKey="createdAt"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  interval={0}
                  height={40}
                  padding={{ left: horizontalPadding, right: horizontalPadding }}
                  tick={<RunXAxisTick points={points} />}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={4}
                  domain={[0, "auto"]}
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                />
                <CartesianGrid strokeDasharray="5 5 1 5" horizontal={false} syncWithTicks />
                {currentRun && (
                  <ReferenceLine
                    x={currentRun.createdAt}
                    stroke="hsl(var(--chart-1))"
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                  />
                )}
                <ChartTooltip
                  cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: 4 }}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_value, payload) => {
                        const p = payload?.[0]?.payload as RunPoint | undefined;
                        if (!p) return null;
                        return (
                          <div className="truncate max-w-60">
                            <div className="font-medium">{p.name}</div>
                            <div className="font-normal text-muted-foreground">
                              {p.createdAt ? formatTimestamp(p.createdAt) : "—"}
                            </div>
                          </div>
                        );
                      }}
                      formatter={(value) => (
                        <>
                          <div
                            className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                            style={{ background: "hsl(var(--chart-1))" }}
                          />
                          <div className="flex flex-1 items-center justify-between leading-none">
                            <span className="text-muted-foreground">{activeScore ?? "score"}</span>
                            <span className="ml-2 font-mono font-medium tabular-nums text-foreground">
                              {value == null ? "—" : formatScoreValue(value as number)}
                            </span>
                          </div>
                        </>
                      )}
                    />
                  }
                />{" "}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  connectNulls
                  isAnimationActive={false}
                  activeDot={false}
                  dot={<RunDot onSelect={onSelectTrace} />}
                />
              </LineChart>
            </ChartContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function RunXAxisTick({
  x,
  y,
  payload,
  index,
  points,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
  index?: number;
  points: RunPoint[];
}) {
  const name = index != null ? points[index]?.name : undefined;
  const hasName = !!name && name !== "—";
  const isCurrent = index != null ? !!points[index]?.isCurrent : false;
  const nameWidth = Math.min(Math.max(900 / points.length, 56), 110);
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      {hasName && (
        <Text
          x={0}
          y={0}
          dy={4}
          width={nameWidth}
          className="truncate"
          maxLines={1}
          breakAll
          textAnchor="middle"
          verticalAnchor="start"
          fill={isCurrent ? "hsl(var(--foreground))" : "hsl(var(--secondary-foreground))"}
          style={{ fontSize: 12, fontWeight: isCurrent ? 600 : 400 }}
        >
          {name}
        </Text>
      )}
      <Text
        x={0}
        y={0}
        dy={hasName ? 20 : 4}
        textAnchor="middle"
        verticalAnchor="start"
        fill={isCurrent ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))"}
        style={{ fontSize: 11, fontWeight: isCurrent ? 500 : 400 }}
      >
        {payload?.value ? shortTime(payload.value) : ""}
      </Text>
    </g>
  );
}

// recharts injects cx/cy/payload when it clones this as the Line `dot`.
function RunDot({
  cx,
  cy,
  payload,
  onSelect,
}: {
  cx?: number;
  cy?: number;
  payload?: RunPoint;
  onSelect: (traceId: string) => void;
}) {
  if (cx == null || cy == null || payload?.value == null) return null;
  const isCurrent = !!payload.isCurrent;
  return (
    <g style={{ cursor: "pointer" }} onClick={() => payload.traceId && onSelect(payload.traceId)}>
      {/* enlarged transparent hit target so the small dots are easy to click */}
      <circle cx={cx} cy={cy} r={9} fill="transparent" />
      <circle
        cx={cx}
        cy={cy}
        r={isCurrent ? 4 : 3}
        fill={isCurrent ? "hsl(var(--chart-1))" : "hsl(var(--background))"}
        stroke="hsl(var(--chart-1))"
        strokeWidth={isCurrent ? 2 : 1.5}
        strokeOpacity={isCurrent ? 1 : 0.6}
      />
    </g>
  );
}
