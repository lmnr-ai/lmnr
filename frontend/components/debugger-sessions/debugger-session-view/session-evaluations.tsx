"use client";

import { ArrowUpRight, FlaskConical } from "lucide-react";
import Link from "next/link";

import { Response } from "@/components/ai-elements/response";
import { formatScoreValue } from "@/components/evaluation/utils";
import { type SessionEvaluation } from "@/lib/actions/debugger-sessions";
import { cn } from "@/lib/utils";

import { noteMarkdownComponents, noteProseClassName } from "./note-markdown";
import { evalAnchorId } from "./session-outline/utils";

interface SessionEvaluationsProps {
  projectId: string;
  evaluations: SessionEvaluation[];
}

// A score with its change vs the same-named score on the previous eval.
type ScoreWithDelta = { name: string; value: number; delta?: number };

const withScoreDeltas = (evaluations: SessionEvaluation[]): ScoreWithDelta[][] => {
  const prev = new Map<string, number>();
  return evaluations.map((evaluation) => {
    const scores = evaluation.scores.map((score) => {
      const before = prev.get(score.name);
      return {
        name: score.name,
        value: score.averageValue,
        delta: before === undefined ? undefined : score.averageValue - before,
      };
    });
    // Update the baseline after computing this row's deltas.
    for (const score of evaluation.scores) prev.set(score.name, score.averageValue);
    return scores;
  });
};

// Cards for the evals linked to a session (via `rollout.session_id`), earliest
// first. Each shows the eval's note and score averages with the delta vs the
// previous eval.
export default function SessionEvaluations({ projectId, evaluations }: SessionEvaluationsProps) {
  if (evaluations.length === 0) return null;

  const deltas = withScoreDeltas(evaluations);

  return (
    <section className="flex flex-col gap-2.5 pb-8">
      <div className="flex items-center gap-2 text-secondary-foreground">
        <FlaskConical className="size-3.5" />
        <h2 className="text-sm font-medium">
          {evaluations.length} {evaluations.length === 1 ? "evaluation" : "evaluations"}
        </h2>
      </div>
      <div className="flex flex-col gap-2">
        {evaluations.map((evaluation, i) => (
          <EvaluationCard key={evaluation.id} projectId={projectId} evaluation={evaluation} scores={deltas[i]} />
        ))}
      </div>
    </section>
  );
}

const EvaluationCard = ({
  projectId,
  evaluation,
  scores,
}: {
  projectId: string;
  evaluation: SessionEvaluation;
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
        <span className="truncate text-sm font-medium text-foreground">{evaluation.name}</span>
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>

      {scores.length > 0 && (
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {scores.map((score) => (
            <ScoreStat key={score.name} name={score.name} value={score.value} delta={score.delta} />
          ))}
        </div>
      )}
    </div>

    {evaluation.note && (
      <div className="border-t px-4 py-3">
        <Response className={cn(noteProseClassName)} components={noteMarkdownComponents}>
          {evaluation.note}
        </Response>
      </div>
    )}
  </div>
);

const ScoreStat = ({ name, value, delta }: ScoreWithDelta) => (
  <div className="flex flex-col gap-0.5">
    <span className="truncate text-xs text-muted-foreground" title={name}>
      {name}
    </span>
    <div className="flex items-baseline gap-1.5">
      <span className="text-xl font-semibold tabular-nums text-foreground" title={String(value)}>
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
