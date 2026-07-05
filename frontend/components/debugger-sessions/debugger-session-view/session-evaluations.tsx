"use client";

import { ArrowUpRight, FlaskConical } from "lucide-react";
import Link from "next/link";

import { formatScoreValue } from "@/components/evaluation/utils";
import { type SessionEvaluationRef } from "@/lib/actions/debugger-sessions";
import { cn } from "@/lib/utils";

import NoteContent from "./note-content";
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

// One evaluation card, rendered inline in the session timeline (interleaved with
// runs and text notes by block `created_at`). Sets the `evalAnchorId` id so the
// outline's anchor navigation keeps working. `note` is the block's note.
export const EvaluationCard = ({
  projectId,
  evaluation,
  note,
  scores,
}: {
  projectId: string;
  evaluation: SessionEvaluationRef;
  note: string | null;
  scores: ScoreWithDelta[];
}) => (
  <div
    id={evalAnchorId(evaluation.id)}
    className="scroll-mt-4 rounded-lg border bg-background transition-colors hover:border-muted-foreground/30"
  >
    <div className="flex flex-col gap-3 px-4 py-3">
      <Link
        href={`/project/${projectId}/evaluations/${evaluation.id}`}
        className="group flex items-center justify-between gap-2"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <FlaskConical className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium text-foreground">{evaluation.name}</span>
        </span>
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>

      {scores.length > 0 && (
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {scores.map((score) => (
            <ScoreStat key={score.name} name={score.name} value={score.value} delta={score.delta} isNew={score.isNew} />
          ))}
        </div>
      )}
    </div>

    {note && (
      <div className="border-t px-4 py-3">
        <NoteContent content={note} />
      </div>
    )}
  </div>
);

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
