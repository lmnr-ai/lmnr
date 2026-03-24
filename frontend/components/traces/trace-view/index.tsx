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

export default function TraceView(props: TraceViewProps) {
  return (
    <TraceViewStoreProvider
      initialTrace={props.propsTrace}
      isAlwaysSelectSpan={props.isAlwaysSelectSpan}
      initialSignalId={props.initialSignalId}
      initialSignalsPanelOpen={props.initialSignalsPanelOpen}
    >
      <TraceViewContent {...props} />
    </TraceViewStoreProvider>
  );
}

export function SidePanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("absolute top-0 right-0 bottom-0 bg-background border-l z-50 flex max-w-full", className)}>
      {children}
    </div>
  );
}

export function TraceViewSidePanel({ className, ...traceViewProps }: TraceViewProps & { className?: string }) {
  return (
    <SidePanel className={className}>
      <TraceView {...traceViewProps} />
    </SidePanel>
  );
}
