import { useCallback } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { useUltimateTraceViewStore } from "./store";

interface SignalIndicatorsProps {
  traceId: string;
}

const emptySignals: never[] = [];

export default function SignalIndicators({ traceId }: SignalIndicatorsProps) {
  const signals = useUltimateTraceViewStore((state) => state.traces.get(traceId)?.signals ?? emptySignals);
  const openSpanListPanel = useUltimateTraceViewStore((state) => state.openSpanListPanel);
  const setSelectedSpanIds = useUltimateTraceViewStore((state) => state.setSelectedSpanIds);

  const handleSignalClick = useCallback(
    (signalId: string) => {
      const signal = signals.find((s) => s.signalId === signalId);
      if (!signal) return;
      // Filter to the signal's associated spans
      setSelectedSpanIds(traceId, new Set(signal.associatedSpanIds));
      openSpanListPanel(traceId, signal.associatedSpanIds, signal.signalName);
    },
    [signals, traceId, setSelectedSpanIds, openSpanListPanel]
  );

  if (signals.length === 0) return null;

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex items-center gap-1">
        {signals.map((signal) => (
          <Tooltip key={signal.signalId}>
            <TooltipTrigger asChild>
              <button
                className="size-3 rounded-full flex-shrink-0 transition-transform hover:scale-125 focus:outline-none"
                style={{ backgroundColor: signal.color }}
                onClick={() => handleSignalClick(signal.signalId)}
              />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {signal.signalName}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
