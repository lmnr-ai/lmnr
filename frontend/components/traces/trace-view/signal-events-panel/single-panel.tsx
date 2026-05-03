"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";

import { getSignalColor } from "@/components/signals/utils";
import { type TraceSignal } from "@/components/traces/trace-view/store/base";
import { Button } from "@/components/ui/button";
import { type EventRow } from "@/lib/events/types";

import SignalTab from "./signal-tab";
import { schemaFieldsToStructuredOutput } from "./utils";

interface Props {
  traceId: string;
  signal: TraceSignal;
  onClose: () => void;
}

export default function SinglePanel({ traceId, signal, onClose }: Props) {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <motion.div className="flex items-center gap-1.5 h-8 px-1 overflow-hidden" layout layoutId="signals-panel-layout">
        <motion.div
          layout
          layoutId={`trace-signals-layout-${signal.signalId}`}
          className="size-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: getSignalColor(signal.signalId, signal.color) }}
          transition={{ layout: { type: "spring", stiffness: 300, damping: 30 } }}
        />
        <span className="text-xs flex-1 truncate">{signal.signalName}</span>
        <Button variant="ghost" className="h-6 w-6 p-0 flex-shrink-0" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </motion.div>
      <div className="flex-1 min-h-0 overflow-y-auto styled-scrollbar">
        <SignalTab
          signalId={signal.signalId}
          signalName={signal.signalName}
          traceId={traceId}
          prompt={signal.prompt}
          structuredOutput={schemaFieldsToStructuredOutput(signal.schemaFields)}
          events={(signal.events as EventRow[]) ?? []}
        />
      </div>
    </div>
  );
}
