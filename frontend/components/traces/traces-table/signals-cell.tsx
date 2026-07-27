import { TooltipPortal } from "@radix-ui/react-tooltip";
import { Radio } from "lucide-react";

import ClusterIcon from "@/components/signal/clusters-section/cluster-list/cluster-icon";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SEVERITY_LABELS } from "@/lib/actions/alerts/types";
import { getClusterColorById, UNCLUSTERED_COLOR } from "@/lib/clusters/colors";
import { type TraceRowSignal } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_CHIPS = 2;

const SEVERITY_TEXT_STYLES: Record<number, string> = {
  0: "text-muted-foreground/60",
  1: "text-orange-400/80",
  2: "text-red-400",
};

function SignalChip({ signal }: { signal: TraceRowSignal }) {
  const hasCluster = !!signal.clusterId;
  const color = hasCluster ? getClusterColorById(signal.clusterId) : UNCLUSTERED_COLOR;
  const label = signal.clusterName ?? signal.signalName;
  const severityLabel = SEVERITY_LABELS[signal.maxSeverity as keyof typeof SEVERITY_LABELS] ?? "Info";
  const severityClassName = SEVERITY_TEXT_STYLES[signal.maxSeverity] ?? SEVERITY_TEXT_STYLES[0];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 min-w-0 shrink rounded-full border px-1.5 py-0.5 text-xs">
          <ClusterIcon iconVariant={hasCluster ? "box" : "circle-dashed"} color={color} />
          <span className="truncate">{label}</span>
          {signal.eventCount > 1 && <span className="shrink-0 text-muted-foreground">{signal.eventCount}</span>}
        </div>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side="bottom" className="max-w-80 p-2.5 border">
          <div className="flex flex-col gap-1.5 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <Radio className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="font-medium text-foreground truncate min-w-0 flex-1">{signal.signalName}</span>
              <Badge
                variant="outline"
                className={cn("rounded-full font-medium shrink-0 px-1.5 py-0.5 text-[10px]", severityClassName)}
              >
                {severityLabel}
              </Badge>
            </div>
            {signal.clusterName && (
              <div className="flex items-center gap-1 min-w-0 font-medium text-foreground">
                <ClusterIcon iconVariant="box" color={color} />
                <span className="truncate">{signal.clusterName}</span>
                {signal.eventCount > 1 && (
                  <span className="shrink-0 text-muted-foreground font-normal">· {signal.eventCount}</span>
                )}
              </div>
            )}
            {!signal.clusterName && signal.eventCount > 1 && (
              <span className="text-muted-foreground">{signal.eventCount} events</span>
            )}
            {signal.summaries.length > 0 && (
              <div className="flex flex-col gap-1 border-t pt-1.5 mt-0.5">
                {signal.summaries.map((summary, i) => (
                  <div key={i} className="line-clamp-2 text-secondary-foreground">
                    {summary}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}

export default function SignalsCell({ signals }: { signals?: TraceRowSignal[] }) {
  if (!signals || signals.length === 0) return "-";

  const visible = signals.slice(0, MAX_VISIBLE_CHIPS);
  const overflow = signals.length - visible.length;

  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex items-center gap-1 min-w-0">
        {visible.map((signal) => (
          <SignalChip key={signal.signalId} signal={signal} />
        ))}
        {overflow > 0 && <span className="shrink-0 text-xs text-muted-foreground">+{overflow}</span>}
      </div>
    </TooltipProvider>
  );
}
