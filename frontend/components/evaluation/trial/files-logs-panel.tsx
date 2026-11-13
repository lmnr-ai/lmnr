import { X } from "lucide-react";

import TaskFiles from "@/components/evaluation/task-files";
import { taskNameOf, taskPathOf, trialNameOf } from "@/components/evaluation/task-files/utils";
import TrialLog from "@/components/evaluation/trial-log";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type EvalRow } from "@/lib/evaluation/types";

import { type Panel, PANEL_LABELS, PANELS } from "./panels";

interface FilesLogsPanelProps {
  panel: Panel;
  onPanelChange: (panel: Panel) => void;
  onClose: () => void;
  projectId: string;
  evaluationId: string;
  trial: EvalRow;
}

/** The trial's task files or its Harbor logs, switchable, in the panel under its trace. */
export default function FilesLogsPanel({
  panel,
  onPanelChange,
  onClose,
  projectId,
  evaluationId,
  trial,
}: FilesLogsPanelProps) {
  const taskName = taskNameOf(trial);
  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex h-9 flex-none items-center border-b pl-3 pr-1">
        <Tabs value={panel} onValueChange={(next) => onPanelChange(next as Panel)}>
          <TabsList size="sm">
            {PANELS.map((p) => (
              <TabsTrigger key={p} value={p}>
                {PANEL_LABELS[p]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button aria-label="Close" onClick={onClose} className="ml-auto" variant="ghost">
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {panel === "task" ? (
          <TaskFiles
            projectId={projectId}
            evaluationId={evaluationId}
            taskPath={taskPathOf(trial)}
            taskName={taskName}
          />
        ) : (
          <TrialLog
            projectId={projectId}
            evaluationId={evaluationId}
            trialName={trialNameOf(trial)}
            taskName={taskName}
          />
        )}
      </div>
    </div>
  );
}
