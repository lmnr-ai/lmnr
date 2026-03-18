import { useCallback, useMemo } from "react";

import { SpanView } from "@/components/traces/span-view";

import { type PanelDescriptor, useUltimateTraceViewStore } from "../store";
import DiffSpanView from "./diff-span-view";
import PanelWrapper from "./panel-wrapper";

interface SpanViewPanelProps {
  panel: PanelDescriptor;
}

export default function SpanViewPanel({ panel }: SpanViewPanelProps) {
  const closePanel = useUltimateTraceViewStore((state) => state.closePanel);
  const spans = useUltimateTraceViewStore((state) => state.traces.get(panel.traceId)?.spans ?? []);
  const panels = useUltimateTraceViewStore((state) => state.panels);

  const spanId = panel.data.spanId ?? "";

  // Find if there's another span-view panel from a different trace (diff mode)
  const otherPanel = useMemo(() => panels.find((p) => p.type === "span-view" && p.key !== panel.key && p.traceId !== panel.traceId), [panels, panel.key, panel.traceId]);

  const isDiffMode = !!otherPanel;

  const spanName = useMemo(() => {
    const span = spans.find((s) => s.spanId === spanId);
    return span?.name ?? "Span";
  }, [spans, spanId]);

  const handleClose = useCallback(() => {
    closePanel(panel.key);
  }, [closePanel, panel.key]);

  // In diff mode, only render the diff on the "left" panel (first one in panel order)
  const isLeftInDiff = useMemo(() => {
    if (!isDiffMode || !otherPanel) return false;
    const myIndex = panels.findIndex((p) => p.key === panel.key);
    const otherIndex = panels.findIndex((p) => p.key === otherPanel.key);
    return myIndex < otherIndex;
  }, [isDiffMode, otherPanel, panels, panel.key]);

  if (isDiffMode && isLeftInDiff && otherPanel?.data.spanId) {
    return (
      <PanelWrapper title={`Diff: ${spanName}`} onClose={handleClose}>
        <DiffSpanView
          leftTraceId={panel.traceId}
          leftSpanId={spanId}
          rightTraceId={otherPanel.traceId}
          rightSpanId={otherPanel.data.spanId}
        />
      </PanelWrapper>
    );
  }

  return (
    <PanelWrapper title={isDiffMode ? spanName : spanName} onClose={handleClose}>
      <SpanView spanId={spanId} traceId={panel.traceId} />
    </PanelWrapper>
  );
}
