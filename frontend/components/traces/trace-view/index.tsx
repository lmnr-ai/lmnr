import { motion } from "framer-motion";
import React from "react";

import TraceViewStoreProvider, { type TraceViewTrace } from "@/components/traces/trace-view/store";
import { cn } from "@/lib/utils";

import TraceViewContent from "./trace-view-content";

interface TraceViewProps {
  traceId: string;
  spanId?: string;
  propsTrace?: TraceViewTrace;
  onClose: () => void;
  isFillWidth?: boolean;
  isAlwaysSelectSpan?: boolean;
  initialSignalsPanelOpen?: boolean;
  initialSignalId?: string;
}

export default function TraceView(props: Omit<TraceViewProps, "isFillWidth">) {
  return (
    <TraceViewStoreProvider
      initialTrace={props.propsTrace}
      isAlwaysSelectSpan={props.isAlwaysSelectSpan}
      initialSignalId={props.initialSignalId}
      initialSignalsPanelOpen={props.initialSignalsPanelOpen}
    >
      <TraceViewContent {...props} isFillWidth />
    </TraceViewStoreProvider>
  );
}

export function TraceViewSidePanel({
  className,
  ...props
}: Omit<TraceViewProps, "isFillWidth"> & { className?: string }) {
  return (
    <motion.div
      className={cn(
        "absolute top-0 right-0 bottom-0 max-w-[calc(100%-80px)] bg-background border-l z-50 flex",
        className
      )}
      initial={{ x: 100, opacity: 0.5 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 100, opacity: 0.7 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <TraceViewStoreProvider
        key={props.traceId}
        initialTrace={props.propsTrace}
        isAlwaysSelectSpan={props.isAlwaysSelectSpan}
        initialSignalId={props.initialSignalId}
        initialSignalsPanelOpen={props.initialSignalsPanelOpen}
      >
        <TraceViewContent {...props} isFillWidth={false} />
      </TraceViewStoreProvider>
    </motion.div>
  );
}
