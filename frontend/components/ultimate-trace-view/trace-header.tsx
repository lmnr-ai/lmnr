import { useCallback } from "react";

import { useToast } from "@/lib/hooks/use-toast";

import { useUltimateTraceViewStore } from "./store";

interface TraceHeaderProps {
  traceId: string;
  // 1-based run position + total, rendered as the muted "N/total" index
  index: number;
  total: number;
}

/**
 * Per-run header row: muted "N/total" run index on the left, "Copy trace ID" and
 * "Open trace" buttons on the right. No title — the agent writes the run's
 * heading inside the markdown note (rendered below by RunComment).
 */
export default function TraceHeader({ traceId, index, total }: TraceHeaderProps) {
  const openSidePanel = useUltimateTraceViewStore((state) => state.openSidePanel);
  const { toast } = useToast();

  const handleCopyTraceId = useCallback(async () => {
    await navigator.clipboard.writeText(traceId);
    toast({ title: "Copied trace ID", duration: 1000 });
  }, [traceId, toast]);

  const handleOpenTrace = useCallback(() => {
    openSidePanel(traceId);
  }, [openSidePanel, traceId]);

  const buttonClass =
    "flex h-7 flex-none items-center justify-center rounded border border-border px-3 text-xs text-secondary-foreground hover:bg-secondary";

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">
        {index}/{total}
      </span>
      <div className="flex flex-none items-center gap-2">
        <button onClick={handleCopyTraceId} className={buttonClass}>
          Copy trace ID
        </button>
        <button onClick={handleOpenTrace} className={buttonClass}>
          Open trace
        </button>
      </div>
    </div>
  );
}
