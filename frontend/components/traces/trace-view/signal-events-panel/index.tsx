"use client";

import { motion } from "framer-motion";
import { Loader2, X } from "lucide-react";

import { DEFAULT_SIGNAL_COLOR } from "@/components/signals/utils";
import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type EventRow } from "@/lib/events/types";

import SignalTab from "./signal-tab";

interface Props {
  traceId: string;
  /** When provided, renders an X close button inside the same motion layout container as the tabs list. */
  onClose?: () => void;
  activeColor?: string;
}

export default function SignalEventsPanel({ traceId, onClose, activeColor }: Props) {
  const traceSignals = useTraceViewStore((state) => state.traceSignals);
  const isTraceSignalsLoading = useTraceViewStore((state) => state.isTraceSignalsLoading);
  const activeSignalTabId = useTraceViewStore((state) => state.activeSignalTabId);
  const setActiveSignalTabId = useTraceViewStore((state) => state.setActiveSignalTabId);

  if (isTraceSignalsLoading) {
    return (
      <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  if (traceSignals.length === 0) {
    return (
      <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
        No signals associated with this trace
      </div>
    );
  }

  const effectiveTabId = activeSignalTabId ?? traceSignals[0]?.signalId ?? "";
  const tabsListBackground = activeColor
    ? `linear-gradient(${activeColor}20, ${activeColor}20), var(--color-muted)`
    : undefined;

  return (
    <Tabs
      value={effectiveTabId}
      onValueChange={setActiveSignalTabId}
      className="flex flex-col flex-1 min-h-0 overflow-hidden gap-0"
    >
      <motion.div className="flex items-center gap-1 overflow-hidden" layout layoutId="signals-panel-layout">
        <TabsList className="flex-1 h-8 overflow-hidden" style={{ background: tabsListBackground }}>
          {traceSignals.map((signal) => (
            <TooltipProvider key={signal.signalId} delayDuration={500}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex-1 basis-0 min-w-0">
                    <TabsTrigger
                      value={signal.signalId}
                      className="w-full text-xs overflow-hidden gap-1.5 data-[state=active]:bg-gray-900"
                    >
                      <motion.div
                        layout
                        layoutId={`trace-signals-layout-${signal.signalId}`}
                        className="size-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: signal.color ?? DEFAULT_SIGNAL_COLOR }}
                        transition={{ layout: { type: "spring", stiffness: 300, damping: 30 } }}
                      />
                      <span className="block truncate">{signal.signalName}</span>
                    </TabsTrigger>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{signal.signalName}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </TabsList>
        {onClose && (
          <Button variant="ghost" className="h-6 w-6 p-0 flex-shrink-0" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </motion.div>
      {traceSignals.map((signal) => (
        <TabsContent
          key={signal.signalId}
          value={signal.signalId}
          className="flex-1 min-h-0 overflow-y-auto styled-scrollbar m-0"
        >
          <SignalTab
            signalId={signal.signalId}
            signalName={signal.signalName}
            traceId={traceId}
            prompt={signal.prompt}
            structuredOutput={signal.schemaFields.reduce(
              (acc, f) => {
                if (f.name.trim()) {
                  acc.properties[f.name] = { type: f.type, description: f.description ?? "" };
                }
                return acc;
              },
              { type: "object", properties: {} } as {
                type: string;
                properties: Record<string, { type: string; description: string }>;
              }
            )}
            events={(signal.events as EventRow[]) ?? []}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
