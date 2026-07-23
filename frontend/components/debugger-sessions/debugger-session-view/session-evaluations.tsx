"use client";

import { ArrowUpRight, Database, FlaskConical } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { formatShortRelativeTime } from "@/components/client-timestamp-formatter";
import { formatScoreValue } from "@/components/evaluation/utils";
import CombinedChart from "@/components/evaluations/progression-chart/combined-chart";
import { type ProgressionPoint } from "@/components/evaluations/progression-chart/shared";
import { CardExpandIndicator } from "@/components/ui/card-expand-indicator";
import { type ChartConfig } from "@/components/ui/chart";
import { type SessionEvaluationRef } from "@/lib/actions/debugger-sessions";
import { cn } from "@/lib/utils";

import { evalAnchorId } from "./session-outline/utils";

// The shared progression dataset every eval card in a session renders: one
// point per evaluation block (timeline order), the union of all score names,
// and a stable per-score color. Identical across cards — each card only differs
// in which run it highlights (its own).
export interface SessionEvalProgression {
  points: ProgressionPoint[];
  scores: string[];
  chartConfig: ChartConfig;
}

// Block `createdAt` arrives in Postgres form ("2026-07-03 14:27:42.062862+00")
// which the chart's `parseUtcTimestamp` mis-parses (its regex misses the `+00`
// offset and appends a second `Z`, yielding an Invalid Date that crashes the
// axis tick formatter). Normalize to a clean `Z`-suffixed ISO string it handles;
// fall back to the raw value if the runtime can't parse it.
const toIsoTimestamp = (s: string): string => {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
};

export const buildSessionEvalProgression = (
  evals: { id: string; name: string; createdAt: string; scores: { name: string; averageValue: number }[] }[]
): SessionEvalProgression => {
  const scoreSet = new Set<string>();
  const points: ProgressionPoint[] = evals.map((e) => {
    const values: Record<string, number | null> = {};
    for (const score of e.scores) {
      values[score.name] = score.averageValue;
      scoreSet.add(score.name);
    }
    return { timestamp: toIsoTimestamp(e.createdAt), evaluationId: e.id, name: e.name, values };
  });
  const scores = [...scoreSet];
  const chartConfig: ChartConfig = Object.fromEntries(
    scores.map((key, index) => [key, { color: `hsl(var(--chart-${(index % 5) + 1}))`, label: key }])
  );
  return { points, scores, chartConfig };
};

// A score with its change vs the same-named score on the previous eval, plus
// whether the score is NEW (its name hadn't appeared in any earlier eval card —
// only meaningful once there's a prior card to compare against).
export type ScoreWithDelta = { name: string; value: number; delta?: number; isNew?: boolean };

// Per-eval score deltas vs the previous eval, keyed by eval id so the
// interleaved timeline can look them up regardless of the eval's position among
// traces / text blocks. `evaluations` must already be in timeline order (the
// blocks are ordered by `created_at`).
export const computeScoreDeltas = (evaluations: SessionEvaluationRef[]): Map<string, ScoreWithDelta[]> => {
  const prev = new Map<string, number>();
  const out = new Map<string, ScoreWithDelta[]>();
  let hasPrevEval = false;
  for (const evaluation of evaluations) {
    const scores = evaluation.scores.map((score) => {
      const before = prev.get(score.name);
      return {
        name: score.name,
        value: score.averageValue,
        delta: before === undefined ? undefined : score.averageValue - before,
        // A brand-new score dimension — but not for the very first card, where
        // "new vs nothing" would just highlight everything.
        isNew: hasPrevEval && before === undefined,
      };
    });
    // Update the baseline after computing this row's deltas.
    for (const score of evaluation.scores) prev.set(score.name, score.averageValue);
    out.set(evaluation.id, scores);
    hasPrevEval = true;
  }
  return out;
};

// One evaluation card in the session timeline, mirroring the trace card chrome:
// tinted header (name + datapoint count + time + collapse indicator) over a body
// of a session-wide progression graph + this run's score stats. Collapsible
// (default expanded); collapse state is owned by the caller (store-backed).
export const EvaluationCard = ({
  projectId,
  evaluation,
  scores,
  createdAt,
  expanded,
  onToggle,
  progression,
  onPointClick,
}: {
  projectId: string;
  evaluation: SessionEvaluationRef;
  scores: ScoreWithDelta[];
  createdAt: string;
  expanded: boolean;
  onToggle: () => void;
  /** The session-wide progression dataset (same for every card). */
  progression?: SessionEvalProgression;
  /** Click a graph point → scroll the timeline to that run's block. */
  onPointClick?: (evaluationId: string) => void;
}) => {
  // Hovering a score stat below spotlights that score's line in the graph.
  const [hoveredScore, setHoveredScore] = useState<string | null>(null);

  const relativeTime = (() => {
    try {
      return formatShortRelativeTime(new Date(createdAt));
    } catch {
      return "";
    }
  })();

  return (
    <div
      id={evalAnchorId(evaluation.id)}
      className="group scroll-mt-4 overflow-hidden rounded-lg border border-[rgba(232,232,232,0.1)] bg-surface-800"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex h-[40px] w-full items-center justify-between gap-2 bg-muted/75 pl-2 pr-3 text-left transition-colors hover:bg-muted/90"
      >
        <div className="flex min-w-0 items-center gap-2">
          <FlaskConical className="size-4 shrink-0 text-emerald-500" />
          <span className="truncate text-[13px] font-medium leading-[17px] text-primary-foreground">
            {evaluation.name}
          </span>
          {evaluation.datapointCount > 0 && (
            <span
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"
              title={`${evaluation.datapointCount} ${evaluation.datapointCount === 1 ? "datapoint" : "datapoints"}`}
            >
              <Database className="size-3" />
              <span className="tabular-nums">{evaluation.datapointCount}</span>
            </span>
          )}
          {/* Explicit open-eval affordance — the header click now toggles collapse,
              so navigation gets its own control (stops the toggle from firing). */}
          <Link
            href={`/project/${projectId}/evaluations/${evaluation.id}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex shrink-0 items-center rounded p-0.5 text-secondary-foreground opacity-0 transition-opacity hover:bg-secondary group-hover:opacity-100"
            title="Open evaluation"
          >
            <ArrowUpRight className="size-4 shrink-0" />
          </Link>
        </div>
        <CardExpandIndicator expanded={expanded} relativeTime={relativeTime} />
      </button>

      {expanded && (
        <>
          {progression && progression.points.length > 0 && (
            <div className="h-32 px-2 py-1 bg-surface-900 border-t">
              <CombinedChart
                data={progression.points}
                scores={progression.scores}
                visibleScores={progression.scores}
                chartConfig={progression.chartConfig}
                // This card's run is ALWAYS the highlighted/selected one.
                hoveredEvaluationId={evaluation.id}
                hoveredScore={hoveredScore}
                onPointClick={onPointClick}
                // Stretch to each score's actual min/max — a session's short
                // series would otherwise sit pinned near the top of a 0–1 axis.
                // (dev's shared `fillHeight` seam, formerly our `fitDomain`.)
                fillHeight
              />
            </div>
          )}
          {scores.length > 0 && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t px-4 py-3 md:grid-cols-3 lg:grid-cols-4 bg-surface-800">
              {scores.map((score) => (
                <ScoreStat
                  key={score.name}
                  name={score.name}
                  value={score.value}
                  delta={score.delta}
                  isNew={score.isNew}
                  color={progression?.chartConfig[score.name]?.color}
                  onHover={setHoveredScore}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// A new score dimension (absent from the previous card) is tinted with the
// brand accent — distinct from the green/red delta colors — instead of a badge.
// Hovering the stat spotlights its line in the card's progression graph.
const ScoreStat = ({
  name,
  value,
  delta,
  isNew,
  color,
  onHover,
}: ScoreWithDelta & { color?: string; onHover?: (name: string | null) => void }) => (
  <div className="flex flex-col gap-0.5" onMouseEnter={() => onHover?.(name)} onMouseLeave={() => onHover?.(null)}>
    <span
      className={cn("flex items-center gap-1.5 truncate text-xs", isNew ? "text-primary" : "text-muted-foreground")}
      title={name}
    >
      {/* Color dot matching this score's line in the graph above. */}
      {color && <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />}
      <span className="truncate">{name}</span>
    </span>
    <div className="flex items-baseline gap-1.5">
      <span
        className={cn("text-xl font-semibold tabular-nums", isNew ? "text-primary" : "text-foreground")}
        title={String(value)}
      >
        {Number.isFinite(value) ? formatScoreValue(value) : "-"}
      </span>
      <ScoreDelta delta={delta} />
    </div>
  </div>
);

const ScoreDelta = ({ delta }: { delta?: number }) => {
  if (delta === undefined || !Number.isFinite(delta) || delta === 0) return null;
  const up = delta > 0;
  return (
    <span className={cn("text-xs font-medium tabular-nums", up ? "text-success" : "text-destructive")}>
      {up ? "▲" : "▼"} {formatScoreValue(Math.abs(delta))}
    </span>
  );
};
