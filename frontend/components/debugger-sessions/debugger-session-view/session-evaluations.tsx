"use client";

import Link from "next/link";

import { Response } from "@/components/ai-elements/response";
import { formatScoreValue } from "@/components/evaluation/utils";
import { type SessionEvaluation } from "@/lib/actions/debugger-sessions";
import { cn } from "@/lib/utils";

import { noteMarkdownComponents, noteProseClassName } from "./note-markdown";

interface SessionEvaluationsProps {
  projectId: string;
  evaluations: SessionEvaluation[];
}

/**
 * Cards for the evaluations linked to a debugger session (same
 * `rollout.session_id` the runs share). Each card shows the eval's note
 * (`rollout.note`, markdown) and all of its score averages. Renders nothing
 * when the session has no linked evals.
 */
export default function SessionEvaluations({ projectId, evaluations }: SessionEvaluationsProps) {
  if (evaluations.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 pb-8">
      <h2 className="text-sm font-medium text-secondary-foreground">
        {evaluations.length} {evaluations.length === 1 ? "evaluation" : "evaluations"}
      </h2>
      <div className="flex flex-col gap-3">
        {evaluations.map((evaluation) => (
          <EvaluationCard key={evaluation.id} projectId={projectId} evaluation={evaluation} />
        ))}
      </div>
    </section>
  );
}

const EvaluationCard = ({ projectId, evaluation }: { projectId: string; evaluation: SessionEvaluation }) => (
  <div className="rounded-lg border bg-background">
    <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
      <Link
        href={`/project/${projectId}/evaluations/${evaluation.id}`}
        className="truncate text-sm font-medium text-foreground hover:text-primary-foreground"
      >
        {evaluation.name}
      </Link>
    </div>

    {evaluation.note && (
      <div className="px-4 py-3">
        <Response className={cn(noteProseClassName)} components={noteMarkdownComponents}>
          {evaluation.note}
        </Response>
      </div>
    )}

    {evaluation.scores.length > 0 ? (
      <div className="flex flex-wrap gap-2 px-4 py-3">
        {evaluation.scores.map((score) => (
          <ScoreChip key={score.name} name={score.name} value={score.averageValue} />
        ))}
      </div>
    ) : (
      <div className="px-4 py-3 text-sm text-muted-foreground">No scores yet</div>
    )}
  </div>
);

const ScoreChip = ({ name, value }: { name: string; value: number }) => (
  <div className="flex min-w-[88px] flex-col gap-0.5 rounded-md border bg-muted/40 px-3 py-2">
    <span className="truncate text-xs text-muted-foreground" title={name}>
      {name}
    </span>
    <span className="text-lg font-semibold tabular-nums text-foreground" title={String(value)}>
      {Number.isFinite(value) ? formatScoreValue(value) : "-"}
    </span>
  </div>
);
