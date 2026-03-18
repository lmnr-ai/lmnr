import { ChevronDown, Share2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useUltimateTraceViewStore } from "./store";

interface TraceHeaderProps {
  traceId: string;
}

export default function TraceHeader({ traceId }: TraceHeaderProps) {
  const hasTrace = useUltimateTraceViewStore((state) => !!state.traces.get(traceId)?.trace);
  const isLoading = useUltimateTraceViewStore((state) => state.traces.get(traceId)?.isTraceLoading ?? false);
  const { projectId } = useParams<{ projectId: string }>();
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(() => {
    const url = `${window.location.origin}/project/${projectId}/traces/${traceId}/alpha`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [projectId, traceId]);

  const traceLabel = hasTrace
    ? `Trace ${traceId.slice(0, 8)}...`
    : isLoading
      ? "Loading..."
      : "Trace";

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-background">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <span className="font-mono text-secondary-foreground">{traceLabel}</span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </div>

      {/* Placeholder for signal indicators (Phase 5) */}
      <div className="flex items-center gap-1 flex-1" />

      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        onClick={handleShare}
      >
        <Share2 className={cn("size-3.5", copied && "text-green-500")} />
      </Button>
    </div>
  );
}
