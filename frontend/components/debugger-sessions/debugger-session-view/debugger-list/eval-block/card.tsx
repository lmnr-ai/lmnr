"use client";

import { ArrowUpRight, Database, FlaskConical } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { formatShortRelativeTime } from "@/components/client-timestamp-formatter";
import { formatScoreValue } from "@/components/evaluation/utils";
import CombinedChart from "@/components/evaluations/progression-chart/combined-chart";
import { CardExpandIndicator } from "@/components/ui/card-expand-indicator";
import { type SessionEvaluationRef } from "@/lib/actions/debugger-sessions";
import { cn } from "@/lib/utils";

import { evalAnchorId } from "../../session-outline/utils";
import { type ScoreWithDelta, type SessionEvalProgression } from "./utils";

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
      className="group scroll-mt-4 overflow-hidden rounded-lg border border-[rgba(232,232,232,0.1)] bg-surface-100"
    >
      {/* The collapse toggle is a full-cover button rendered BEHIND the header
          content, so the open-eval Link can be a sibling (not an anchor nested
          in a button — invalid interactive nesting). The content row is
          pointer-events-none so clicks fall through to the toggle; only the Link
          re-enables pointer events. */}
      <div className="relative">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} evaluation ${evaluation.name}`}
          className="absolute inset-0 h-full w-full bg-muted/75 transition-colors hover:bg-muted/90"
        />
        <div className="pointer-events-none relative flex h-[40px] w-full items-center justify-between gap-2 pl-2 pr-3">
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
            {/* Sibling of the toggle (not nested); pointer-events re-enabled and
                revealed on hover OR keyboard focus so it's reachable without a mouse. */}
            <Link
              href={`/project/${projectId}/evaluations/${evaluation.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="pointer-events-auto inline-flex shrink-0 items-center rounded p-0.5 text-secondary-foreground opacity-0 transition-opacity hover:bg-secondary focus-visible:opacity-100 group-hover:opacity-100"
              title="Open evaluation"
            >
              <ArrowUpRight className="size-4 shrink-0" />
            </Link>
          </div>
          <CardExpandIndicator expanded={expanded} relativeTime={relativeTime} />
        </div>
      </div>

      {expanded && (
        <>
          {/* Gate on scores, not points: a point exists for every eval block even
              with empty scores (a live eval before backfill), so points.length
              alone would mount a blank plot. */}
          {progression && progression.scores.length > 0 && (
            <div className="h-32 px-2 py-1 bg-surface-00 border-t">
              <CombinedChart
                data={progression.points}
                scores={progression.scores}
                visibleScores={progression.scores}
                chartConfig={progression.chartConfig}
                // This card's run is ALWAYS the highlighted/selected one.
                hoveredEvaluationId={evaluation.id}
                hoveredScore={hoveredScore}
                // Fade the other runs hard so this card's run stands out.
                dimmedOpacity={0.12}
                onPointClick={onPointClick}
                // Stretch to each score's actual min/max — a session's short
                // series would otherwise sit pinned near the top of a 0–1 axis.
                // (dev's shared `fillHeight` seam, formerly our `fitDomain`.)
                fillHeight
              />
            </div>
          )}
          {scores.length > 0 && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t px-4 py-3 md:grid-cols-3 lg:grid-cols-4 bg-surface-100">
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
