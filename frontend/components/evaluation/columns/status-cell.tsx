import { Check, Loader2, X } from "lucide-react";

import { deriveStatus, type EvalDatapointStatus } from "@/components/evaluation/utils";
import { isTaskGroupRow } from "@/lib/evaluation/task-groups";
import { type EvalRow } from "@/lib/evaluation/types";

// A Task is pending while any Trial is, and errored only when every Trial errored.
const deriveTaskStatus = (trials: EvalRow[]): { status: EvalDatapointStatus; errors: number } => {
  const statuses = trials.map(deriveStatus);
  const errors = statuses.filter((s) => s === "error").length;
  if (statuses.includes("pending")) return { status: "pending", errors };
  return { status: errors === trials.length ? "error" : "success", errors };
};

export const StatusCell = ({ row }: { row: { original: EvalRow } }) => {
  if (isTaskGroupRow(row.original)) {
    const trials = row.original["subRows"] as EvalRow[];
    const { status, errors } = deriveTaskStatus(trials);
    if (status === "success" && errors > 0) {
      return (
        <div
          className="flex h-full justify-center items-center w-10 text-xs text-destructive-text"
          title={`${errors} of ${trials.length} trials errored`}
        >
          {trials.length - errors}/{trials.length}
        </div>
      );
    }
    return <StatusIcon status={status} />;
  }
  return <StatusIcon status={deriveStatus(row.original)} />;
};

const StatusIcon = ({ status }: { status: EvalDatapointStatus }) => {
  if (status === "error") {
    return (
      <div className="flex h-full justify-center items-center w-10">
        <X className="self-center text-destructive-text" size={18} />
      </div>
    );
  }
  if (status === "success") {
    return (
      <div className="flex h-full justify-center items-center w-10">
        <Check className="text-success-text" size={18} />
      </div>
    );
  }
  return (
    <div className="flex h-full justify-center items-center w-10">
      <Loader2 className="text-muted-foreground animate-spin" size={18} />
    </div>
  );
};
