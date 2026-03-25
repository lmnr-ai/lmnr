import React, { useRef } from "react";

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
  initialSignalId?: string;
  showChatInitial?: boolean;
}

export default function TraceView(props: Omit<TraceViewProps, "isFillWidth">) {
  return (
    <TraceViewStoreProvider
      initialTrace={props.propsTrace}
      isAlwaysSelectSpan={props.isAlwaysSelectSpan}
      initialSignalId={props.initialSignalId}
      initialChatOpen={props.showChatInitial}
    >
      <TraceViewContent {...props} />
    </TraceViewStoreProvider>
  );
}

export function TraceViewSidePanel({
  className,
  children,
  ...props
}: Omit<TraceViewProps, "isFillWidth"> & { className?: string; children?: React.ReactNode }) {
  const sidePanelRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={sidePanelRef}
      className={cn(
        "absolute top-0 right-0 bottom-0 max-w-[calc(100%-80px)] bg-background border-l z-50 flex",
        className
      )}
    >
      <TraceViewStoreProvider
        key={props.traceId}
        initialTrace={props.propsTrace}
        isAlwaysSelectSpan={props.isAlwaysSelectSpan}
        initialSignalId={props.initialSignalId}
        initialChatOpen={props.showChatInitial}
      >
        <div className="w-full h-full flex flex-col">
          {children}
          <TraceViewContent {...props} sidePanelRef={sidePanelRef} />
        </div>
      </TraceViewStoreProvider>
    </div>
  );
}
