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
  const otherPanel = useMemo(
    () => panels.find((p) => p.type === "span-view" && p.key !== panel.key && p.traceId !== panel.traceId),
    [panels, panel.key, panel.traceId]
  );

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

  if (isDiffMode && otherPanel?.data.spanId) {
    // Both panels render a DiffSpanView. The left panel shows base->compare,
    // the right panel shows compare->base (swapped perspective).
    const leftTraceId = isLeftInDiff ? panel.traceId : otherPanel.traceId;
    const leftSpanId = isLeftInDiff ? spanId : otherPanel.data.spanId;
    const rightTraceId = isLeftInDiff ? otherPanel.traceId : panel.traceId;
    const rightSpanId = isLeftInDiff ? otherPanel.data.spanId : spanId;

    return (
      <PanelWrapper title={`Diff: ${spanName}`} onClose={handleClose}>
        <DiffSpanView
          leftTraceId={leftTraceId}
          leftSpanId={leftSpanId}
          rightTraceId={rightTraceId}
          rightSpanId={rightSpanId}
        />
      </PanelWrapper>
    );
  }

  return (
    <PanelWrapper title={spanName} onClose={handleClose}>
      <SpanView spanId={spanId} traceId={panel.traceId} />
    </PanelWrapper>
  );
}
