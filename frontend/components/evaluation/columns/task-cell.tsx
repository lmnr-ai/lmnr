import { type CellContext } from "@tanstack/react-table";
import { ChevronRight } from "lucide-react";

import { isTaskGroupRow } from "@/lib/evaluation/task-groups";
import { type EvalRow } from "@/lib/evaluation/types";

// Cells are memoized on row data, so the chevron rotates from the row's `eval-task-expanded` class.
export const TaskCell = ({ row, getValue }: CellContext<EvalRow, unknown>) => {
  if (row.depth > 0) {
    return <span className="pl-5 text-secondary-foreground">Trial {String(row.original["trialNumber"])}</span>;
  }

  const taskId = String(getValue() ?? "");
  const isGroup = isTaskGroupRow(row.original);

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {isGroup ? (
        <ChevronRight
          size={14}
          className="shrink-0 text-muted-foreground transition-transform [.eval-task-expanded_&]:rotate-90"
        />
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
      {taskId.trim() ? (
        <span className="truncate" title={taskId}>
          {taskId}
        </span>
      ) : (
        // Whitespace-only ids are distinct Tasks; quote them so they don't render blank.
        <span className="truncate text-muted-foreground">{JSON.stringify(taskId)}</span>
      )}
      {isGroup && (
        <span className="shrink-0 rounded bg-muted px-1 text-xs text-muted-foreground">
          ×{String(row.original["trialCount"])}
        </span>
      )}
    </div>
  );
};
