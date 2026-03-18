import { ChevronDown, Copy, Database, Loader, Share2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";

import { useOpenInSql } from "@/components/traces/trace-view/use-open-in-sql";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/lib/hooks/use-toast";

import { useUltimateTraceViewStore } from "./store";
import DepthSliderBar from "./timeline/depth-slider-bar";

interface TraceHeaderProps {
  traceId: string;
}

export default function TraceHeader({ traceId }: TraceHeaderProps) {
  const hasTrace = useUltimateTraceViewStore((state) => !!state.traces.get(traceId)?.trace);
  const isLoading = useUltimateTraceViewStore((state) => state.traces.get(traceId)?.isTraceLoading ?? false);
  const maxDepth = useUltimateTraceViewStore((state) => state.traces.get(traceId)?.maxDepth ?? 0);
  const granularityDepth = useUltimateTraceViewStore((state) => state.traces.get(traceId)?.granularityDepth ?? 0);
  const setGranularityDepth = useUltimateTraceViewStore((state) => state.setGranularityDepth);
  const openSpanListPanel = useUltimateTraceViewStore((state) => state.openSpanListPanel);
  const spans = useUltimateTraceViewStore((state) => state.traces.get(traceId)?.spans ?? []);
  const setSelectedSpanIds = useUltimateTraceViewStore((state) => state.setSelectedSpanIds);
  const { projectId } = useParams<{ projectId: string }>();
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const { openInSql, isLoading: isSqlLoading } = useOpenInSql({
    projectId,
    params: { type: "trace", traceId },
  });

  const handleShare = useCallback(() => {
    const url = `${window.location.origin}/project/${projectId}/traces/${traceId}/alpha`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [projectId, traceId]);

  const handleCopyTraceId = useCallback(async () => {
    await navigator.clipboard.writeText(traceId);
    toast({ title: "Copied trace ID", duration: 1000 });
  }, [traceId, toast]);

  const handleTraceIdClick = useCallback(() => {
    const allSpanIds = spans.map((s) => s.spanId);
    setSelectedSpanIds(traceId, new Set(allSpanIds));
    openSpanListPanel(traceId, allSpanIds, "All Spans");
  }, [spans, traceId, setSelectedSpanIds, openSpanListPanel]);

  const handleDepthChange = useCallback(
    (depth: number) => {
      setGranularityDepth(traceId, depth);
    },
    [traceId, setGranularityDepth]
  );

  const traceLabel = hasTrace ? traceId : isLoading ? "Loading..." : "Trace";

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-background">
      <div className="flex items-center gap-1.5 text-sm font-medium min-w-0">
        <span className="flex-shrink-0">Trace</span>
        <span
          className="font-mono text-xs text-secondary-foreground truncate cursor-pointer hover:text-foreground hover:underline"
          onClick={handleTraceIdClick}
        >
          {traceLabel}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-6 px-1 hover:bg-secondary flex-shrink-0">
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={handleCopyTraceId}>
              <Copy size={14} />
              Copy trace ID
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isSqlLoading} onClick={openInSql}>
              {isSqlLoading ? <Loader className="size-3.5 animate-spin" /> : <Database className="size-3.5" />}
              Open in SQL editor
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Depth slider bar */}
      <DepthSliderBar granularityDepth={granularityDepth} maxDepth={maxDepth} onDepthChange={handleDepthChange} />

      {/* Placeholder for signal indicators (Phase 5) */}
      <div className="flex items-center gap-1 flex-1" />

      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7" onClick={handleShare}>
              <Share2 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copied ? "Copied!" : "Copy link"}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
