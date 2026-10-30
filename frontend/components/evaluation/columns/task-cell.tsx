import { type CellContext } from "@tanstack/react-table";

import CopyTooltip from "@/components/ui/copy-tooltip";
import { type EvalRow } from "@/lib/evaluation/types";

export const TaskCell = ({ row, getValue }: CellContext<EvalRow, unknown>) => {
  if (row.depth > 0) {
    const trialId = String(row.original["id"]);
    return (
      <CopyTooltip value={trialId} text="Copy Trial id" className="pl-3 font-mono text-secondary-foreground">
        {`${trialId.slice(0, 8)}…`}
      </CopyTooltip>
    );
  }

  const taskId = String(getValue() ?? "");
  return taskId.trim() ? (
    <span className="truncate" title={taskId}>
      {taskId}
    </span>
  ) : (
    // Whitespace-only ids are distinct Tasks; quote them so they don't render blank.
    <span className="truncate whitespace-pre text-muted-foreground">{JSON.stringify(taskId)}</span>
  );
};
