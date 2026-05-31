"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo } from "react";
import { Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
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

const MIN_POINT_WIDTH = 72;
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

const formatScore = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3));

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

  const minWidth = Math.max(points.length * MIN_POINT_WIDTH, 240);

  return (
    <div className={cn("flex-none border-b px-5", collapsed ? "py-2" : "py-4 space-y-2")}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-secondary-foreground truncate">
          Row #{index} across {points.length} runs
          {!collapsed && " — click a point to open that run's trace"}
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
      {!collapsed && (
        <div className="h-[120px] overflow-x-auto overflow-y-hidden">
          <div className="h-full" style={{ minWidth }}>
            <ChartContainer config={CHART_CONFIG} className="aspect-auto h-full w-full">
              <LineChart margin={{ top: 12, right: 16, bottom: 4, left: 0 }} data={points} accessibilityLayer>
                <XAxis
                  dataKey="createdAt"
                  tickFormatter={shortTime}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  interval={0}
                  height={20}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={4}
                  width="auto"
                  domain={[0, "auto"]}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip
                  cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: 4 }}
                  content={<RunTooltip score={activeScore} />}
                />
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
      )}
    </div>
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
        r={isCurrent ? 5 : 3.5}
        fill={isCurrent ? "hsl(var(--chart-1))" : "hsl(var(--background))"}
        stroke="hsl(var(--chart-1))"
        strokeWidth={isCurrent ? 2 : 1.5}
      />
    </g>
  );
}

function RunTooltip({
  active,
  payload,
  score,
}: {
  active?: boolean;
  payload?: Array<{ payload?: RunPoint }>;
  score?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-md">
      <div className="font-medium mb-1 truncate max-w-60">
        {point.name}
        {point.isCurrent && <span className="ml-1 text-muted-foreground">(current)</span>}
      </div>
      <div className="text-muted-foreground">{point.createdAt ? formatTimestamp(point.createdAt) : "—"}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="size-2 rounded-sm shrink-0" style={{ background: "hsl(var(--chart-1))" }} />
        <span className="text-muted-foreground">{score ?? "score"}</span>
        <span className="ml-auto font-mono">{point.value === null ? "—" : formatScore(point.value)}</span>
      </div>
    </div>
  );
}
