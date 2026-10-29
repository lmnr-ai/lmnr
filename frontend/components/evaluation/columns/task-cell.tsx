import { type CellContext } from "@tanstack/react-table";

import { type EvalRow } from "@/lib/evaluation/types";

export const TaskCell = ({ row, getValue }: CellContext<EvalRow, unknown>) => {
  if (row.depth > 0) {
    return <span className="pl-3 text-secondary-foreground">Trial {String(row.original["attempt"])}</span>;
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
