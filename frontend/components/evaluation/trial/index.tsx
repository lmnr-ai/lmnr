"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";

import { useReportAgentContextName } from "@/components/agent";
import RowScoreChips from "@/components/evaluation/row-score-chips";
import { taskNameOf } from "@/components/evaluation/task-files/utils";
import { type EvalRow, type Evaluation as EvaluationType } from "@/lib/evaluation/types";

import BottomSplit from "./bottom-split";
import FilesButton from "./files-button";
import FilesLogsPanel from "./files-logs-panel";
import TrialHeader from "./header";
import { PANELS } from "./panels";
import TrialTrace from "./trial-trace";
import { useLiveTrial } from "./use-live-trial";

interface EvaluationTrialProps {
  evaluation: EvaluationType;
  /** Every run in the evaluation's group: the score chips' history spans them. */
  groupEvaluations: EvaluationType[];
  trial: EvalRow;
  scoreNames: string[];
}

/**
 * One trial on its own page. The bar on top is the trial's own (scores, and for remote runs a Files
 * toggle); below it is the trace, with the trial's task files / Harbor logs in a panel under it.
 */
export default function EvaluationTrial(props: EvaluationTrialProps) {
  const { evaluation, groupEvaluations } = props;
  const projectId = evaluation.projectId;
  const { trial, scoreNames } = useLiveTrial(projectId, evaluation.id, props.trial, props.scoreNames);
  const isHosted = !!evaluation.hostedMetadata;
  useReportAgentContextName("evaluation", evaluation.name);
  // Null: the panel is closed.
  const [panel, setPanel] = useQueryState("panel", parseAsStringLiteral(PANELS));

  return (
    <>
      <TrialHeader
        projectId={projectId}
        evaluation={evaluation}
        trialId={trial["id"] as string}
        taskName={taskNameOf(trial)}
      />
      {(scoreNames.length > 0 || isHosted) && (
        <div className="flex flex-none items-center gap-2 border-t px-4 py-2">
          <div className="min-w-0 flex-1">
            <RowScoreChips
              projectId={projectId}
              evaluations={groupEvaluations}
              currentEvaluationId={evaluation.id}
              scoreNames={scoreNames}
              row={trial}
            />
          </div>
          {isHosted && <FilesButton open={!!panel} onToggle={() => setPanel(panel ? null : "task")} />}
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden border-t">
        <BottomSplit
          trace={<TrialTrace trial={trial} />}
          panel={
            isHosted &&
            panel && (
              <FilesLogsPanel
                panel={panel}
                onPanelChange={setPanel}
                onClose={() => setPanel(null)}
                projectId={projectId}
                evaluationId={evaluation.id}
                trial={trial}
              />
            )
          }
        />
      </div>
    </>
  );
}
