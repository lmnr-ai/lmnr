import { type SessionEvaluationRef } from "@/lib/actions/debugger-sessions";

import { EvaluationCard, type ScoreWithDelta } from "../session-evaluations";

interface EvaluationBlockItemProps {
  projectId?: string;
  evaluation: SessionEvaluationRef;
  scores: ScoreWithDelta[];
  createdAt: string;
}

// An evaluation block in the timeline (identity + per-score deltas).
export default function EvaluationBlockItem({ projectId, evaluation, scores, createdAt }: EvaluationBlockItemProps) {
  return (
    <div className="py-5">
      <EvaluationCard projectId={projectId ?? ""} evaluation={evaluation} scores={scores} createdAt={createdAt} />
    </div>
  );
}
