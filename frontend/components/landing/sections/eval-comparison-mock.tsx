"use client";

import { ArrowRight, PanelLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { renderTick } from "@/components/evaluation/graphs-utils";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Metric = "reward" | "accuracy" | "completeness";
type EvalKey = "opus-4.5" | "opus-4.6" | "gpt-5.1" | "gpt-5.0";

interface ResultPoint {
  duration: number;
  reward: number;
  accuracy: number;
  completeness: number;
}

interface EvalRun {
  label: string;
  ts: string;
  results: ResultPoint[];
}

const METRICS: Metric[] = ["reward", "accuracy", "completeness"];
const EVAL_ORDER: EvalKey[] = ["opus-4.5", "opus-4.6", "gpt-5.1", "gpt-5.0"];

const EVALS: Record<EvalKey, EvalRun> = {
  "opus-4.5": {
    label: "opus-4.5",
    ts: "Jan 16, 17:41",
    results: [
      { duration: 427.3, reward: 0.5, accuracy: 0.68, completeness: 0.62 },
      { duration: 204.31, reward: 0.55, accuracy: 0.75, completeness: 0.68 },
      { duration: 96.14, reward: 0.6, accuracy: 0.72, completeness: 0.65 },
      { duration: 344.15, reward: 0.67, accuracy: 0.78, completeness: 0.7 },
    ],
  },
  "opus-4.6": {
    label: "opus-4.6",
    ts: "Jan 17, 09:12",
    results: [
      { duration: 312.2, reward: 0.62, accuracy: 0.78, completeness: 0.7 },
      { duration: 189.5, reward: 0.66, accuracy: 0.82, completeness: 0.74 },
      { duration: 82.4, reward: 0.65, accuracy: 0.8, completeness: 0.72 },
      { duration: 298.1, reward: 0.71, accuracy: 0.85, completeness: 0.76 },
    ],
  },
  "gpt-5.1": {
    label: "gpt-5.1",
    ts: "Jan 16, 17:42",
    results: [
      { duration: 591.9, reward: 0.35, accuracy: 0.55, completeness: 0.48 },
      { duration: 788.41, reward: 0.42, accuracy: 0.62, completeness: 0.55 },
      { duration: 290.56, reward: 0.4, accuracy: 0.58, completeness: 0.5 },
      { duration: 110.35, reward: 0.48, accuracy: 0.65, completeness: 0.52 },
    ],
  },
  "gpt-5.0": {
    label: "gpt-5.0",
    ts: "Jan 14, 11:08",
    results: [
      { duration: 612.4, reward: 0.28, accuracy: 0.45, completeness: 0.4 },
      { duration: 822.1, reward: 0.32, accuracy: 0.52, completeness: 0.45 },
      { duration: 314.2, reward: 0.3, accuracy: 0.48, completeness: 0.42 },
      { duration: 145.8, reward: 0.38, accuracy: 0.55, completeness: 0.48 },
    ],
  },
};

interface Datapoint {
  target: string;
  data: string;
  meta: string;
}

const DATAPOINTS: Datapoint[] = [
  {
    target: '"pyknotid"',
    data: '"pyknotid is a knot identification library — implement the new identifier."',
    meta: '{ "lang": "py", "tier": "swe-bench" }',
  },
  {
    target: '"pMARS sim"',
    data: '"Build pMARS (the Multi-Arena Redcode Simulator) from the seed sources."',
    meta: '{ "lang": "c", "tier": "swe-bench" }',
  },
  {
    target: '"flat ancestry"',
    data: '"You\'re given a tree of users — produce a flat ancestry mapping."',
    meta: '{ "lang": "py", "tier": "easy" }',
  },
  {
    target: '"husky hook"',
    data: '"Configure a git pre-commit hook that runs lint and type-check."',
    meta: '{ "lang": "shell", "tier": "easy" }',
  },
];

const CHART_CONFIG = {
  comparedHeight: { label: "Compared", color: "hsl(var(--chart-2))" },
  height: { label: "Current", color: "hsl(var(--chart-1))" },
};

const BUCKET_COUNT = 10;

const bucketize = (values: number[]): number[] => {
  const buckets = Array.from({ length: BUCKET_COUNT }, () => 0);
  for (const v of values) {
    const idx = Math.min(BUCKET_COUNT - 1, Math.max(0, Math.floor(v * BUCKET_COUNT)));
    buckets[idx]++;
  }
  return buckets;
};

const avg = (values: number[]): number => (values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length);

const formatDuration = (s: number): string => `${s.toFixed(2)}s`;

const StatusCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" className="size-4 text-green-400" aria-hidden>
    <path d="M5 12l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const EvalPillSelect = ({
  selected,
  options,
  onChange,
}: {
  selected: EvalKey;
  options: EvalKey[];
  onChange: (v: EvalKey) => void;
}) => {
  const item = EVALS[selected];
  return (
    <Select value={selected} onValueChange={(v) => onChange(v as EvalKey)}>
      <SelectTrigger className="h-7 w-fit gap-1.5 border-border px-2.5 py-1 text-xs">
        <SelectValue asChild>
          <span className="flex items-center gap-1.5">
            <span className="font-medium text-foreground mr-2">{item.label}</span>
            <span className="text-muted-foreground">{item.ts}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((key) => (
          <SelectItem key={key} value={key}>
            <span className="flex items-center gap-1.5">
              <span className="font-medium">{EVALS[key].label}</span>
              <span className="text-muted-foreground">{EVALS[key].ts}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

interface Props {
  className?: string;
}

const EvalComparisonMock = ({ className }: Props) => {
  const [current, setCurrent] = useState<EvalKey>("opus-4.5");
  const [compared, setCompared] = useState<EvalKey>("gpt-5.1");
  const [metric, setMetric] = useState<Metric>("reward");

  const otherOptions = useMemo(() => EVAL_ORDER.filter((k) => k !== current && k !== compared), [current, compared]);

  const comparedRun = EVALS[compared];
  const currentRun = EVALS[current];

  const comparedValues = useMemo(() => comparedRun.results.map((r) => r[metric]), [comparedRun, metric]);
  const currentValues = useMemo(() => currentRun.results.map((r) => r[metric]), [currentRun, metric]);

  const comparedAvg = useMemo(() => avg(comparedValues), [comparedValues]);
  const currentAvg = useMemo(() => avg(currentValues), [currentValues]);
  const delta = currentAvg - comparedAvg;
  const showComparison = comparedAvg !== 0 && delta !== 0;
  const deltaPct = showComparison ? (delta / comparedAvg) * 100 : 0;
  const isImprovement = delta >= 0;

  const chartData = useMemo(() => {
    const comparedBuckets = bucketize(comparedValues);
    const currentBuckets = bucketize(currentValues);
    return Array.from({ length: BUCKET_COUNT }, (_, i) => ({
      index: i,
      comparedHeight: comparedBuckets[i],
      height: currentBuckets[i],
    }));
  }, [comparedValues, currentValues]);

  return (
    <div className={cn("flex w-full max-w-[760px] flex-col gap-3 rounded-lg border bg-background p-4", className)}>
      <div className="flex items-center gap-2 text-sm">
        <PanelLeft className="size-4 text-muted-foreground" strokeWidth={1.5} />
        <span className="text-muted-foreground">evaluations</span>
        <span className="text-muted-foreground/60">/</span>
        <span className="font-medium text-foreground">{currentRun.label}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <EvalPillSelect selected={compared} options={otherOptions} onChange={setCompared} />
        <ArrowRight className="size-4 text-muted-foreground" />
        <EvalPillSelect selected={current} options={otherOptions} onChange={setCurrent} />
        <Button variant="outline" size="sm" className="h-7 px-3 text-xs">
          Reset
        </Button>
      </div>

      <div className="flex flex-col gap-6 rounded-md border bg-secondary p-4 sm:flex-row sm:items-start">
        <div className="flex flex-col gap-1.5">
          <Select value={metric} onValueChange={(v) => setMetric(v as Metric)}>
            <SelectTrigger className="h-7 w-fit gap-2 px-2 text-xs font-medium text-secondary-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METRICS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mt-1 text-sm text-muted-foreground">Average</div>
          <div className="flex items-center gap-3">
            <div className="text-5xl tracking-tighter font-semibold tabular-nums">{comparedAvg.toFixed(2)}</div>
            <ArrowRight className="size-7 tracking-tighter text-muted-foreground" />
            <div className="text-5xl font-semibold tabular-nums">{currentAvg.toFixed(2)}</div>
          </div>
          {showComparison && (
            <div className={cn("text-sm font-medium", isImprovement ? "text-green-400" : "text-red-400")}>
              <span className="mr-1">{isImprovement ? "▲" : "▼"}</span>
              {Math.abs(delta).toFixed(2)} <span>({deltaPct.toFixed(2)}%)</span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <ChartContainer config={CHART_CONFIG} className="h-44 w-full">
            <BarChart accessibilityLayer data={chartData} barSize="4%">
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="index"
                tickLine={false}
                axisLine
                padding={{ left: 0, right: 0 }}
                tick={renderTick as any}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="comparedHeight" fill="hsl(var(--chart-2))" radius={4} name="Compared" />
              <Bar dataKey="height" fill="hsl(var(--chart-1))" radius={4} name="Current" />
            </BarChart>
          </ChartContainer>
        </div>
      </div>

      <div className="flex flex-col overflow-hidden rounded-md border bg-secondary">
        <div className="flex border-b text-xs text-muted-foreground">
          <div className="w-[56px] shrink-0 px-3 py-2">Status</div>
          <div className="w-[120px] shrink-0 px-2 py-2">Target</div>
          <div className="w-[180px] shrink-0 px-2 py-2">Duration</div>
          <div className="w-[56px] shrink-0 px-2 py-2">Index</div>
          <div className="min-w-0 flex-1 px-2 py-2">Data</div>
          <div className="w-[180px] shrink-0 px-2 py-2 pr-3">Metadata</div>
        </div>
        {DATAPOINTS.map((dp, i) => (
          <div key={i} className="flex border-b text-sm last:border-b-0 hover:bg-muted/40 transition-colors">
            <div className="w-[56px] shrink-0 px-3 py-2">
              <StatusCheck />
            </div>
            <div className="w-[120px] shrink-0 truncate px-2 py-2 font-mono text-xs text-secondary-foreground">
              {dp.target}
            </div>
            <div className="w-[180px] shrink-0 px-2 py-2">
              <div className="flex items-center gap-1.5 font-mono text-xs">
                <span className="text-green-300">{formatDuration(comparedRun.results[i].duration)}</span>
                <ArrowRight className="size-3 text-muted-foreground" />
                <span className="text-blue-300">{formatDuration(currentRun.results[i].duration)}</span>
              </div>
            </div>
            <div className="w-[56px] shrink-0 px-2 py-2 text-secondary-foreground">{i}</div>
            <div className="min-w-0 flex-1 truncate px-2 py-2 text-secondary-foreground">{dp.data}</div>
            <div className="w-[180px] shrink-0 truncate px-2 py-2 pr-3 font-mono text-xs text-secondary-foreground">
              {dp.meta}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EvalComparisonMock;
