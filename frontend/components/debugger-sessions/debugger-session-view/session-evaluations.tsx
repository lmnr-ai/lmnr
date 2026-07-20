"use client";

import Link from "next/link";

import { formatShortRelativeTime } from "@/components/client-timestamp-formatter";
import { formatScoreValue } from "@/components/evaluation/utils";
import { ArrowUpRight, Database, FlaskConical } from "@/components/ui/icon-lib";
import { type SessionEvaluationRef } from "@/lib/actions/debugger-sessions";
import { cn } from "@/lib/utils";

import { evalAnchorId } from "./session-outline/utils";

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
// tinted header (name + datapoint count + time) over a body of score stats.
export const EvaluationCard = ({
  projectId,
  evaluation,
  scores,
  createdAt,
}: {
  projectId: string;
  evaluation: SessionEvaluationRef;
  scores: ScoreWithDelta[];
  createdAt: string;
}) => {
  const relativeTime = (() => {
    try {
      return formatShortRelativeTime(new Date(createdAt));
    } catch {
      return "";
    }
  })();

  return (
    <Link
      id={evalAnchorId(evaluation.id)}
      href={`/project/${projectId}/evaluations/${evaluation.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group block scroll-mt-4 overflow-hidden rounded-lg border border-[rgba(232,232,232,0.1)] bg-background no-underline transition-colors hover:border-muted-foreground/30"
    >
      <div className="flex h-[40px] items-center justify-between gap-2 bg-muted/75 pl-2 pr-3 transition-colors group-hover:bg-muted/90">
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
        </div>
        <div className="flex shrink-0 items-center">
          {relativeTime && (
            <span className="whitespace-nowrap text-[13px] leading-[17px] text-secondary-foreground">
              {relativeTime}
            </span>
          )}
          {/* Zero-width until hover so it reserves no space, then slides in. */}
          <span className="flex w-0 items-center overflow-hidden opacity-0 transition-all duration-200 group-hover:ml-1.5 group-hover:w-4 group-hover:opacity-100">
            <ArrowUpRight className="size-4 shrink-0 text-secondary-foreground" />
          </span>
        </div>
      </div>

      {scores.length > 0 && (
        <div className="flex flex-wrap gap-x-8 gap-y-3 px-4 py-3">
          {scores.map((score) => (
            <ScoreStat key={score.name} name={score.name} value={score.value} delta={score.delta} isNew={score.isNew} />
          ))}
        </div>
      )}
    </Link>
  );
};

// A new score dimension (absent from the previous card) is tinted with the
// brand accent — distinct from the green/red delta colors — instead of a badge.
const ScoreStat = ({ name, value, delta, isNew }: ScoreWithDelta) => (
  <div className="flex flex-col gap-0.5">
    <span className={cn("truncate text-xs", isNew ? "text-primary" : "text-muted-foreground")} title={name}>
      {name}
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
