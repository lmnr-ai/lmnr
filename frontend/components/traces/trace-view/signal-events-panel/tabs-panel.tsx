"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";

import { getSignalColor } from "@/components/signals/utils";
import { type TraceSignal } from "@/components/traces/trace-view/store/base";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type EventRow } from "@/lib/events/types";

import SignalTab from "./signal-tab";
import { schemaFieldsToStructuredOutput } from "./utils";

interface Props {
  traceId: string;
  traceSignals: TraceSignal[];
  activeSignalTabId: string | null;
  setActiveSignalTabId: (id: string | null) => void;
  onClose: () => void;
}

export default function TabsPanel({ traceId, traceSignals, activeSignalTabId, setActiveSignalTabId, onClose }: Props) {
  const effectiveTabId = activeSignalTabId ?? traceSignals[0]?.signalId ?? "";

  return (
    <Tabs
      value={effectiveTabId}
      onValueChange={setActiveSignalTabId}
      className="flex flex-col flex-1 min-h-0 overflow-hidden gap-0"
    >
      <motion.div className="flex items-center gap-1 overflow-hidden" layout layoutId="signals-panel-layout">
        <TabsList className="flex-1 h-8 overflow-hidden bg-transparent p-0">
          {traceSignals.map((signal) => (
            <TooltipProvider key={signal.signalId} delayDuration={500}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex-1 basis-0 min-w-0">
                    <TabsTrigger
                      value={signal.signalId}
                      className="w-full text-xs overflow-hidden gap-1.5 data-[state=active]:bg-background"
                    >
                      <motion.div
                        layout
                        layoutId={`trace-signals-layout-${signal.signalId}`}
                        className="size-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: getSignalColor(signal.signalId, signal.color) }}
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
        <Button variant="ghost" className="h-6 w-6 p-0 flex-shrink-0" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
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
            structuredOutput={schemaFieldsToStructuredOutput(signal.schemaFields)}
            events={(signal.events as EventRow[]) ?? []}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
