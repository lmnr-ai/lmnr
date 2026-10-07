import { type SessionEvaluationRef } from "@/lib/actions/debugger-sessions";

import { EvaluationCard } from "./card";
import { type ScoreWithDelta, type SessionEvalProgression } from "./utils";

interface EvaluationBlockItemProps {
  projectId?: string;
  evaluation: SessionEvaluationRef;
  scores: ScoreWithDelta[];
  createdAt: string;
  expanded: boolean;
  onToggle: () => void;
  progression?: SessionEvalProgression;
  onPointClick?: (evaluationId: string) => void;
}

// An evaluation block in the timeline (identity + per-score deltas + the
// session-wide progression graph). Collapsible; state is store-backed.
export default function EvaluationBlockItem({
  projectId,
  evaluation,
  scores,
  createdAt,
  expanded,
  onToggle,
  progression,
  onPointClick,
}: EvaluationBlockItemProps) {
  // No vertical padding — inter-block spacing is owned by seam rows (see flat-rows).
  return (
    <div>
      <EvaluationCard
        projectId={projectId ?? ""}
        evaluation={evaluation}
        scores={scores}
        createdAt={createdAt}
        expanded={expanded}
        onToggle={onToggle}
        progression={progression}
        onPointClick={onPointClick}
      />
    </div>
  );
}
