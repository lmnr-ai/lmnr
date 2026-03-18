import { useCallback, useMemo } from "react";

import { SpanView } from "@/components/traces/span-view";

import { type PanelDescriptor, useUltimateTraceViewStore } from "../store";
import PanelWrapper from "./panel-wrapper";

interface SpanViewPanelProps {
  panel: PanelDescriptor;
}

export default function SpanViewPanel({ panel }: SpanViewPanelProps) {
  const closePanel = useUltimateTraceViewStore((state) => state.closePanel);
  const spans = useUltimateTraceViewStore((state) => state.traces.get(panel.traceId)?.spans ?? []);

  const spanId = panel.data.spanId ?? "";

  const spanName = useMemo(() => {
    const span = spans.find((s) => s.spanId === spanId);
    return span?.name ?? "Span";
  }, [spans, spanId]);

  const handleClose = useCallback(() => {
    closePanel(panel.key);
  }, [closePanel, panel.key]);

  return (
    <PanelWrapper title={spanName} onClose={handleClose}>
      <SpanView spanId={spanId} traceId={panel.traceId} />
    </PanelWrapper>
  );
}
