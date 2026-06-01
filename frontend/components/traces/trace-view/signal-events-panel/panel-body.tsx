"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { ArrowUpRight, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { shallow } from "zustand/shallow";

import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import ClusterLink from "./cluster-link";
import ExpandedContent from "./expanded-content";
import { usePanelHover } from "./hover-context";

interface Props {
  traceId: string;
  onClose: () => void;
}

/** The shared inner shell of the panel — used identically by both the
 *  HoverCard trigger (collapsed) and the HoverCardContent portal (expanded).
 *  The only thing that changes between the two is the `PanelHoverContext`
 *  value, which `ExpandedContent` reads to decide whether to show the
 *  toolbar. Outer border / background / sizing are owned by `index.tsx`. */
export default function PanelBody({ traceId, onClose }: Props) {
  const { projectId } = useParams();
  const isHover = usePanelHover();
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
  const leafCluster = activeSignal?.clusterPath?.[activeSignal.clusterPath.length - 1];
  const isUnclustered = !leafCluster;

  if (isTraceSignalsLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-6 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

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
    <Tabs value={effectiveTabId} onValueChange={setActiveSignalTabId} className="flex flex-col flex-1 min-h-0 gap-0">
      <TooltipProvider delayDuration={300}>
        <div className="shrink-0 flex flex-col gap-2 px-1.5 py-1.5 bg-blue-400/10">
          <div className="flex items-center gap-2 justify-between">
            {isSingleSignal && activeSignal && isUnclustered && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={`/project/${projectId}/signals/${activeSignal.signalId}?traceId=${traceId}`}
                    target="_blank"
                    className="flex items-center gap-1.5 min-w-0 text-xs text-foreground pl-2.5 hover:text-foreground/80 font-medium"
                  >
                    <span className="truncate">{activeSignal.signalName}</span>
                    <ArrowUpRight className="size-4 shrink-0" />
                  </Link>
                </TooltipTrigger>
                <TooltipPortal>
                  <TooltipContent side="top">Open in Signals</TooltipContent>
                </TooltipPortal>
              </Tooltip>
            )}
            {isSingleSignal && activeSignal && leafCluster && (
              <ClusterLink
                signalName={activeSignal.signalName}
                clusterPath={activeSignal.clusterPath}
                projectId={projectId as string}
                signalId={activeSignal.signalId}
                traceId={traceId}
                className="pl-1.5"
              />
            )}
            {!isSingleSignal && (
              <TabsList className="flex-1 min-w-0 h-auto bg-transparent p-0 gap-1 justify-start">
                {traceSignals.map((signal) => (
                  <TabsTrigger
                    key={signal.signalId}
                    value={signal.signalId}
                    className={cn(
                      "flex-1 min-w-0 h-auto px-2 py-0.5 text-xs rounded",
                      "data-[state=active]:bg-blue-400/20 data-[state=active]:shadow-none data-[state=active]:text-foreground",
                      "text-secondary-foreground hover:text-foreground"
                    )}
                  >
                    {/* `block w-full truncate` — `truncate` only renders
                      ellipsis on block-level boxes with constrained width.
                      The default inline span lets text overflow visibly
                      even after the trigger has shrunk via `flex-1 min-w-0`. */}
                    <span className="block w-full truncate text-center">{signal.signalName}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            )}
            {closeButton}
          </div>
          {!isSingleSignal && activeSignal && leafCluster && (
            <ClusterLink
              signalName={activeSignal.signalName}
              clusterPath={activeSignal.clusterPath}
              projectId={projectId as string}
              signalId={activeSignal.signalId}
              traceId={traceId}
              className="pl-1"
            />
          )}
        </div>
      </TooltipProvider>
      {/* Closed (trigger) state clips overflow; only the hovered popover scrolls.
          `[&>div>div]:!block` — Radix wraps the ScrollArea Viewport children in a
          div with inline `display:table; min-width:100%`, which lets long content
          force horizontal overflow. Keep this override. */}
      {isHover ? (
        <ScrollArea className="flex-1 min-h-0 [&>div>div]:!block">
          {traceSignals.map((signal) => (
            <TabsContent
              key={signal.signalId}
              value={signal.signalId}
              className="m-0 outline-none data-[state=inactive]:hidden"
            >
              <ExpandedContent traceId={traceId} signal={signal} />
            </TabsContent>
          ))}
        </ScrollArea>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden">
          {traceSignals.map((signal) => (
            <TabsContent
              key={signal.signalId}
              value={signal.signalId}
              className="m-0 outline-none data-[state=inactive]:hidden"
            >
              <ExpandedContent traceId={traceId} signal={signal} />
            </TabsContent>
          ))}
        </div>
      )}
    </Tabs>
  );
}
