"use client";

import { motion } from "framer-motion";
import { shallow } from "zustand/shallow";

import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { cn } from "@/lib/utils";

import PanelBody from "./panel-body";

interface Props {
  traceId: string;
  onClose: () => void;
  className?: string;
}

export default function SignalEventsPanel({ traceId, onClose, className }: Props) {
  const { traceSignals, isTraceSignalsLoading } = useTraceViewStore(
    (state) => ({
      traceSignals: state.traceSignals,
      isTraceSignalsLoading: state.isTraceSignalsLoading,
    }),
    shallow
  );

  if (!isTraceSignalsLoading && traceSignals.length === 0) return null;

  return (
    <motion.div
      className={cn("overflow-hidden", className)}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <PanelBody traceId={traceId} onClose={onClose} />
    </motion.div>
  );
}
