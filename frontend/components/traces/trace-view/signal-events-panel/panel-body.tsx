"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { Loader2, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { shallow } from "zustand/shallow";

import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { withOpacity } from "@/lib/clusters/colors";
import { cn } from "@/lib/utils";

import SignalDetails from "./signal-details";
import SignalHeaderLink from "./signal-header-link";
import { getSignalAccentColor } from "./utils";

interface Props {
  traceId: string;
  onClose: () => void;
}

export default function PanelBody({ traceId, onClose }: Props) {
  const { projectId } = useParams();
  const { traceSignals, isTraceSignalsLoading, activeSignalTabId, setActiveSignalTabId, initialSignalId } =
    useTraceViewStore(
      (state) => ({
        traceSignals: state.traceSignals,
        isTraceSignalsLoading: state.isTraceSignalsLoading,
        activeSignalTabId: state.activeSignalTabId,
        setActiveSignalTabId: state.setActiveSignalTabId,
        initialSignalId: state.initialSignalId,
      }),
      shallow
    );

  const effectiveTabId = useMemo(() => {
    if (activeSignalTabId && traceSignals.some((s) => s.signalId === activeSignalTabId)) {
      return activeSignalTabId;
    }
    if (initialSignalId && traceSignals.some((s) => s.signalId === initialSignalId)) {
      return initialSignalId;
    }
    return traceSignals[0]?.signalId ?? "";
  }, [activeSignalTabId, initialSignalId, traceSignals]);

  const isSingleSignal = traceSignals.length === 1;
  const activeSignal = traceSignals.find((s) => s.signalId === effectiveTabId);
  const leafCluster = activeSignal?.leafCluster;
  const accent = getSignalAccentColor(activeSignal);

  const closeButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side="top">Close</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );

  return (
    <div
      className="flex flex-col rounded-lg border bg-secondary overflow-hidden"
      style={{ borderColor: withOpacity(accent, 0.35) }}
    >
      {isTraceSignalsLoading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : (
        <Tabs value={effectiveTabId} onValueChange={setActiveSignalTabId} className="flex flex-col gap-0">
          <TooltipProvider delayDuration={300}>
            <div
              className="shrink-0 flex flex-col gap-2 px-2 py-1.5"
              style={{ backgroundColor: withOpacity(accent, 0.08) }}
            >
              <div className="flex items-center gap-2 justify-between">
                {isSingleSignal && activeSignal && (
                  <SignalHeaderLink
                    signal={activeSignal}
                    leafCluster={leafCluster}
                    projectId={projectId as string}
                    traceId={traceId}
                  />
                )}
                {!isSingleSignal && (
                  <TabsList className="flex-1 min-w-0 h-auto bg-transparent p-0 gap-1 justify-start">
                    {traceSignals.map((signal) => (
                      <TabsTrigger
                        key={signal.signalId}
                        value={signal.signalId}
                        className={cn(
                          "flex-1 min-w-0 h-auto px-2 py-1 text-xs rounded",
                          "data-[state=active]:bg-background data-[state=active]:shadow-none data-[state=active]:text-foreground",
                          "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <span className="block w-full truncate text-center">{signal.signalName}</span>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                )}
                {closeButton}
              </div>
              {!isSingleSignal && activeSignal && (
                <SignalHeaderLink
                  signal={activeSignal}
                  leafCluster={leafCluster}
                  projectId={projectId as string}
                  traceId={traceId}
                  compact
                />
              )}
            </div>
          </TooltipProvider>
          <ScrollArea className="[&>div>div]:!block [&>[data-radix-scroll-area-viewport]]:max-h-40 xl:[&>[data-radix-scroll-area-viewport]]:max-h-64">
            {traceSignals.map((signal) => (
              <TabsContent
                key={signal.signalId}
                value={signal.signalId}
                className="m-0 outline-none data-[state=inactive]:hidden"
              >
                <SignalDetails traceId={traceId} signal={signal} />
              </TabsContent>
            ))}
          </ScrollArea>
        </Tabs>
      )}
    </div>
  );
}
