import { Check, CircleAlert, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { type RowGates } from "./gates";

/**
 * Status column content: a leading state icon + `passing/total` gate count.
 * Spinner while the datapoint is still running; otherwise a green tick when
 * every gate passes, an amber partial marker when some fail, red when the
 * trace errored.
 */
export const GateSummary = ({ summary }: { summary: RowGates }) => {
  const { status, passing, total, allPassing } = summary;

  if (status === "pending") {
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="animate-spin" size={15} />
        <span className="text-xs tabular-nums">running</span>
      </div>
    );
  }

  if (status === "error" && total === 0) {
    return (
      <div className="flex items-center gap-1.5 text-destructive">
        <X size={15} />
        <span className="text-xs">error</span>
      </div>
    );
  }

  // Only soft measurements ran — no pass/fail gates to summarize.
  if (total === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const Icon = allPassing ? Check : passing === 0 ? X : CircleAlert;
  const color = allPassing ? "text-success-bright" : passing === 0 ? "text-destructive" : "text-amber-500";

  return (
    <div className={cn("flex items-center gap-1.5", color)}>
      <Icon size={15} strokeWidth={2.5} />
      <span className="text-xs font-medium tabular-nums">
        {passing}/{total}
      </span>
    </div>
  );
};
