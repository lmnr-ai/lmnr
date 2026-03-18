"use client";

import { useCallback } from "react";

import TracePicker from "@/components/traces/trace-picker";
import type { TraceRow } from "@/lib/traces/types";

import { type PanelDescriptor, useUltimateTraceViewStore } from "../store";
import PanelWrapper from "./panel-wrapper";

interface TracePickerPanelProps {
  panel: PanelDescriptor;
}

export default function TracePickerPanel({ panel }: TracePickerPanelProps) {
  const closePanel = useUltimateTraceViewStore((state) => state.closePanel);
  const addTrace = useUltimateTraceViewStore((state) => state.addTrace);
  const traceOrder = useUltimateTraceViewStore((state) => state.traceOrder);

  const handleClose = useCallback(() => {
    closePanel(panel.key);
  }, [closePanel, panel.key]);

  const handleTraceSelect = useCallback(
    (trace: TraceRow) => {
      if (traceOrder.includes(trace.id)) return;
      addTrace(trace.id);
      closePanel(panel.key);
    },
    [addTrace, closePanel, panel.key, traceOrder]
  );

  return (
    <PanelWrapper title="Add Trace" onClose={handleClose}>
      <TracePicker
        onTraceSelect={handleTraceSelect}
        description="Select a trace to compare"
        className="flex flex-col flex-1 gap-3 px-2 py-2 overflow-hidden"
      />
    </PanelWrapper>
  );
}
