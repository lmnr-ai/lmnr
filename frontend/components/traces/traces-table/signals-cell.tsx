import { TooltipPortal } from "@radix-ui/react-tooltip";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SEVERITY_LABELS } from "@/lib/actions/alerts/types";
import { getClusterColorById, withOpacity } from "@/lib/clusters/colors";
import { type TraceRowSignal } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_CHIPS = 2;

const SEVERITY_DOT_STYLES: Record<number, string> = {
  0: "bg-muted-foreground/60",
  1: "bg-orange-400/80",
  2: "bg-red-400",
};

function SignalChip({ signal }: { signal: TraceRowSignal }) {
  const label = signal.clusterName ?? signal.signalName;
  const color = signal.clusterId ? getClusterColorById(signal.clusterId) : "var(--color-primary)";
  const severityLabel = SEVERITY_LABELS[signal.maxSeverity as keyof typeof SEVERITY_LABELS] ?? "Info";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="flex items-center gap-1.5 min-w-0 shrink rounded-full border px-2 py-0.5 text-xs"
          style={{ borderColor: withOpacity(color, 0.5), backgroundColor: withOpacity(color, 0.12) }}
        >
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              SEVERITY_DOT_STYLES[signal.maxSeverity] ?? SEVERITY_DOT_STYLES[0]
            )}
          />
          <span className="truncate">{label}</span>
          {signal.eventCount > 1 && <span className="shrink-0 text-muted-foreground">{signal.eventCount}</span>}
        </div>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side="bottom" className="max-w-96 p-2 border">
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-medium">{signal.signalName}</span>
              <span className="text-muted-foreground">
                {severityLabel}
                {signal.eventCount > 1 && ` · ${signal.eventCount} events`}
              </span>
            </div>
            {signal.clusterName && <div className="text-muted-foreground">Cluster: {signal.clusterName}</div>}
            {signal.summaries.map((summary, i) => (
              <div key={i} className="line-clamp-3 text-secondary-foreground">
                {summary}
              </div>
            ))}
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
