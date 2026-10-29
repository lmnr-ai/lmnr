import { type HeaderContext } from "@tanstack/react-table";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Loader2, X } from "lucide-react";

import { deriveStatus, type EvalDatapointStatus } from "@/components/evaluation/utils";
import { isTaskGroupRow } from "@/lib/evaluation/task-groups";
import { type EvalRow } from "@/lib/evaluation/types";

import { StatusRing } from "./status-ring";

export const StatusCell = ({ row }: { row: { original: EvalRow } }) => {
  if (!isTaskGroupRow(row.original)) {
    return (
      <div className="flex h-full items-center gap-2">
        <span className="w-3.5 shrink-0" />
        <StatusIcon status={deriveStatus(row.original)} />
      </div>
    );
  }

  const statuses = (row.original["subRows"] as EvalRow[]).map(deriveStatus);
  const succeeded = statuses.filter((s) => s === "success").length;
  const failed = statuses.filter((s) => s === "error").length;
  const pending = statuses.length - succeeded - failed;

  return (
    <div className="flex h-full items-center gap-2 text-xs font-medium text-secondary-foreground">
      {/* Cells are memoized on row data, so the chevron turns from the row's `eval-task-expanded` class. */}
      <ChevronDown size={14} className="shrink-0 -rotate-90 transition-transform [.eval-task-expanded_&]:rotate-0" />
      <span className="flex items-center gap-1">
        {pending === 0 && succeeded > 0 && failed > 0 ? (
          <StatusRing succeeded={succeeded} failed={failed} />
        ) : (
          <StatusIcon status={pending > 0 ? "pending" : statuses[0]} />
        )}
        {statuses.length}
      </span>
    </div>
  );
};

export const StatusHeader = ({ table }: HeaderContext<EvalRow, unknown>) => {
  const running = table.options.meta?.evalCellMeta?.runningTrials ?? 0;
  // The header label clips overflow, so the pill can't use negative margins; instead the spacer is
  // the rows' chevron width minus the pill's 4px inset, keeping the loader over the row icons.
  return (
    <span className="flex items-center gap-2" title={running > 0 ? `${running} trials still running` : undefined}>
      <span className="w-2.5 shrink-0" />
      <AnimatePresence initial={false}>
        {running > 0 && (
          <motion.span
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex items-center gap-1 rounded-full border border-emphasis-1 bg-emphasis-1 py-[3px] pl-[3px] pr-[7px] leading-[14px]"
          >
            <StatusIcon status="pending" />
            {running}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
};

const StatusIcon = ({ status }: { status: EvalDatapointStatus }) => {
  if (status === "error") return <X className="shrink-0 text-destructive-text" size={14} />;
  if (status === "success") return <Check className="shrink-0 text-success-text" size={14} />;
  return <Loader2 className="shrink-0 animate-spin text-muted-foreground" size={14} />;
};
