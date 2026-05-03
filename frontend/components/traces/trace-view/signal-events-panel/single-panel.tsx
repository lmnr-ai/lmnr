"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";

import { getSignalColor } from "@/components/signals/utils";
import { type TraceSignal } from "@/components/traces/trace-view/store/base";
import { Button } from "@/components/ui/button";
import { type EventRow } from "@/lib/events/types";

import SignalTab from "./signal-tab";
import Toolbar from "./toolbar";
import { schemaFieldsToStructuredOutput } from "./utils";

interface Props {
  traceId: string;
  signal: TraceSignal;
  onClose: () => void;
  /** Suppress shared-layout (`layoutId`) animation. Used for the portal copy so
      framer-motion isn't trying to morph between two instances of the same id. */
  noSharedLayout?: boolean;
}

export default function SinglePanel({ traceId, signal, onClose, noSharedLayout }: Props) {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <motion.div
        className="flex items-center gap-1.5 h-8 px-1 overflow-hidden shrink-0"
        {...(noSharedLayout ? {} : { layout: true, layoutId: "signals-panel-layout" })}
      >
        <motion.div
          {...(noSharedLayout ? {} : { layout: true, layoutId: `trace-signals-layout-${signal.signalId}` })}
          className="size-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: getSignalColor(signal.signalId, signal.color) }}
          transition={{ layout: { type: "spring", stiffness: 300, damping: 30 } }}
        />
        <span className="text-xs flex-1 truncate">{signal.signalName}</span>
        <Button variant="ghost" className="h-6 w-6 p-0 flex-shrink-0" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </motion.div>
      <Toolbar signal={signal} />
      <div className="flex-1 min-h-0 overflow-y-auto styled-scrollbar">
        <SignalTab
          traceId={traceId}
          structuredOutput={schemaFieldsToStructuredOutput(signal.schemaFields)}
          events={(signal.events as EventRow[]) ?? []}
        />
      </div>
    </div>
  );
}
