"use client";

import { useMemo } from "react";
import useSWR from "swr";

import { Skeleton } from "@/components/ui/skeleton";
import { type EvaluationDatapointComparisonRow } from "@/lib/actions/evaluation";
import { type Evaluation as EvaluationType } from "@/lib/evaluation/types";
import { cn, formatTimestamp, swrFetcher } from "@/lib/utils";

const MAX_RUNS = 30;
const W = 232;
const H = 22;

interface HistoryBlockProps {
  projectId: string;
  index: number;
  evaluations: EvaluationType[];
  currentEvaluationId: string;
  scoreNames: string[];
  onSelectTrace: (traceId: string) => void;
}

type RunPoint = { traceId: string; evaluationId: string; label: string; value: number | null; isCurrent: boolean };

const fmtScore = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3));

/**
 * V3: this datapoint's scores across previous runs in the group, as per-score
 * sparkline small-multiples INSIDE the selection context (under the selected
 * sidebar row) — deliberately not the old full-width strip above the trace,
 * whose permanence/placement is why it was ripped out. Click a point to open
 * that run's trace. Hidden when the datapoint exists in <2 runs.
 */
export default function HistoryBlock({
  projectId,
  index,
  evaluations,
  currentEvaluationId,
  scoreNames,
  onSelectTrace,
}: HistoryBlockProps) {
  const url = useMemo(() => {
    const ids = evaluations.map((e) => e.id).join(",");
    return `/api/projects/${projectId}/evaluations/datapoint-comparison?evaluationIds=${ids}&index=${index}`;
  }, [projectId, evaluations, index]);

  const { data, isLoading, error } = useSWR<{ rows: EvaluationDatapointComparisonRow[] }>(url, swrFetcher, {
    revalidateOnFocus: false,
  });

  const runs = useMemo(() => {
    const evalById = new Map(evaluations.map((e) => [e.id, e]));
    // Dedup by evaluationId (RMT pre-merge duplicates); keep last seen.
    const byEval = new Map<string, EvaluationDatapointComparisonRow>();
    (data?.rows ?? []).forEach((r) => byEval.set(r.evaluationId, r));
    return Array.from(byEval.values())
      .map((r) => ({ row: r, ev: evalById.get(r.evaluationId) }))
      .sort((a, b) => new Date(a.ev?.createdAt ?? 0).getTime() - new Date(b.ev?.createdAt ?? 0).getTime())
      .slice(-MAX_RUNS);
  }, [data, evaluations]);

  if (isLoading) {
    return (
      <div className="border-b bg-muted/30 px-2.5 py-2">
        <Skeleton className="h-16 w-full rounded" />
      </div>
    );
  }
  // Best-effort: nothing to compare (or error) → take no space.
  if (error || runs.length < 2) return null;

  return (
    <div className="border-b bg-muted/30 px-2.5 py-1.5">
      <p className="pb-1 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
        Across {runs.length} runs — click a point
      </p>
      {scoreNames.map((score) => {
        const points: RunPoint[] = runs.map(({ row, ev }) => {
          const v = row.scores[score];
          return {
            traceId: row.traceId,
            evaluationId: row.evaluationId,
            label: ev ? `${ev.name} · ${formatTimestamp(ev.createdAt)}` : "—",
            value: typeof v === "number" && Number.isFinite(v) ? v : null,
            isCurrent: row.evaluationId === currentEvaluationId,
          };
        });
        if (!points.some((p) => p.value !== null)) return null;
        return <ScoreSparkline key={score} score={score} points={points} onSelectTrace={onSelectTrace} />;
      })}
    </div>
  );
}

function ScoreSparkline({
  score,
  points,
  onSelectTrace,
}: {
  score: string;
  points: RunPoint[];
  onSelectTrace: (traceId: string) => void;
}) {
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1; // flat series renders mid-height
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * (W - 8) + 4);
  const y = (v: number) => H - 3 - ((v - min) / span) * (H - 6);

  // Break the polyline at missing runs so gaps stay visible as gaps.
  const segments: string[] = [];
  let seg: string[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (seg.length > 1) segments.push(seg.join(" "));
      seg = [];
    } else {
      seg.push(`${x(i)},${y(p.value)}`);
    }
  });
  if (seg.length > 1) segments.push(seg.join(" "));

  const current = points.find((p) => p.isCurrent);

  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <span className="w-20 shrink-0 truncate text-[0.7rem] text-muted-foreground" title={score}>
        {score}
      </span>
      <svg width={W} height={H} className="min-w-0 flex-1" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {segments.map((s, i) => (
          <polyline key={i} points={s} fill="none" className="stroke-primary/50" strokeWidth={1.2} />
        ))}
        {points.map(
          (p, i) =>
            p.value !== null && (
              <circle
                key={i}
                cx={x(i)}
                cy={y(p.value)}
                r={p.isCurrent ? 3 : 2}
                className={cn("cursor-pointer", p.isCurrent ? "fill-primary" : "fill-primary/40 hover:fill-primary")}
                onClick={() => onSelectTrace(p.traceId)}
              >
                <title>{`${p.label}\n${score}: ${fmtScore(p.value)}`}</title>
              </circle>
            )
        )}
      </svg>
      <span className="w-10 shrink-0 text-right text-[0.7rem] font-medium tabular-nums">
        {current?.value !== null && current?.value !== undefined ? fmtScore(current.value) : "—"}
      </span>
    </div>
  );
}
