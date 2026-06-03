"use client";

import { ChevronDown, Copy, ExternalLink } from "lucide-react";

import { formatShortRelativeTime } from "@/components/client-timestamp-formatter";
import { SpanStatsShield } from "@/components/traces/trace-view/span-stats-shield";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/lib/hooks/use-toast";

import { useUltimateTraceViewStore } from "./store";

interface RunHeaderProps {
  traceId: string;
  // 1-based run position + total, rendered as the "N/total" pill.
  index: number;
  total: number;
}

/**
 * Run card header — the session-view trace-item header bar
 * (`session-panel/trace-item.tsx`), minus the expand/collapse affordances since
 * run cards aren't collapsible here. Left: "N/total" pill, "Trace" label, a
 * dropdown (copy id / open trace), and inline span stats. Right: relative time.
 */
export default function RunHeader({ traceId, index, total }: RunHeaderProps) {
  const trace = useUltimateTraceViewStore((state) => state.traces.get(traceId)?.trace);
  const openSidePanel = useUltimateTraceViewStore((state) => state.openSidePanel);
  const { toast } = useToast();

  const handleCopyTraceId = async () => {
    await navigator.clipboard.writeText(traceId);
    toast({ title: "Copied trace ID", duration: 1000 });
  };

  const handleOpenTrace = () => openSidePanel(traceId);

  let relativeTime = "";
  if (trace?.endTime) {
    try {
      relativeTime = formatShortRelativeTime(new Date(trace.endTime));
    } catch {
      relativeTime = "";
    }
  }

  return (
    <div className="flex w-full items-center justify-between border-b border-[rgba(232,232,232,0.1)] bg-[rgba(232,232,232,0.02)] pl-1.5 pr-3 pt-2 pb-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className="inline-flex items-center justify-center rounded-full border border-[rgba(232,232,232,0.1)] bg-[rgba(232,232,232,0.05)] px-2 py-0.5 text-[10px] font-medium leading-[17px] text-secondary-foreground whitespace-nowrap">
          {index}/{total}
        </span>
        <span className="text-[13px] font-medium leading-[17px] text-primary-foreground whitespace-nowrap">Trace</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <span
              role="button"
              tabIndex={0}
              className="inline-flex items-center justify-center rounded hover:bg-secondary cursor-pointer"
            >
              <ChevronDown className="size-3.5 text-secondary-foreground" />
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={handleCopyTraceId}>
              <Copy size={14} />
              Copy trace ID
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleOpenTrace}>
              <ExternalLink size={14} />
              Open trace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {trace && (
          <SpanStatsShield
            variant="inline"
            startTime={trace.startTime}
            endTime={trace.endTime}
            inputTokens={trace.inputTokens}
            outputTokens={trace.outputTokens}
            cost={trace.totalCost}
            cacheReadInputTokens={trace.cacheReadInputTokens}
          />
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-[13px] leading-[17px] text-secondary-foreground whitespace-nowrap">{relativeTime}</span>
        <button
          type="button"
          onClick={handleOpenTrace}
          className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[13px] leading-[17px] text-secondary-foreground hover:bg-secondary whitespace-nowrap"
        >
          Open trace
        </button>
      </div>
    </div>
  );
}
