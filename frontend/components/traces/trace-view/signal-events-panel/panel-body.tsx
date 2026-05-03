"use client";

import { Loader2 } from "lucide-react";

import { type TraceSignal } from "@/components/traces/trace-view/store/base";

import SinglePanel from "./single-panel";
import TabsPanel from "./tabs-panel";

interface PanelBodyProps {
  traceId: string;
  onClose: () => void;
  activeColor: string;
  isTraceSignalsLoading: boolean;
  traceSignals: TraceSignal[];
  activeSignalTabId: string | null;
  setActiveSignalTabId: (id: string | null) => void;
  noSharedLayout?: boolean;
}

export default function PanelBody({
  traceId,
  onClose,
  activeColor,
  isTraceSignalsLoading,
  traceSignals,
  activeSignalTabId,
  setActiveSignalTabId,
  noSharedLayout,
}: PanelBodyProps) {
  return (
    <div
      className="flex flex-col flex-1 min-h-0 overflow-hidden px-2 pt-1.5"
      style={{ backgroundColor: `${activeColor}05` }}
    >
      {isTraceSignalsLoading ? (
        <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : traceSignals.length === 0 ? (
        <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
          No signals associated with this trace
        </div>
      ) : traceSignals.length === 1 ? (
        <SinglePanel traceId={traceId} signal={traceSignals[0]} onClose={onClose} noSharedLayout={noSharedLayout} />
      ) : (
        <TabsPanel
          traceId={traceId}
          traceSignals={traceSignals}
          activeSignalTabId={activeSignalTabId}
          setActiveSignalTabId={setActiveSignalTabId}
          onClose={onClose}
          noSharedLayout={noSharedLayout}
        />
      )}
    </div>
  );
}
