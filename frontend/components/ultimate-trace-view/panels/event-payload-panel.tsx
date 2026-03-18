import { useCallback } from "react";

import { type PanelDescriptor, useUltimateTraceViewStore } from "../store";
import PanelWrapper from "./panel-wrapper";

interface EventPayloadPanelProps {
  panel: PanelDescriptor;
}

export default function EventPayloadPanel({ panel }: EventPayloadPanelProps) {
  const closePanel = useUltimateTraceViewStore((state) => state.closePanel);

  const handleClose = useCallback(() => {
    closePanel(panel.key);
  }, [closePanel, panel.key]);

  return (
    <PanelWrapper title="Event Payload" onClose={handleClose}>
      <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
        Event payload panel — coming in Phase 5
      </div>
    </PanelWrapper>
  );
}
