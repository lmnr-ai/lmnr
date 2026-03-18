import { useCallback, useMemo } from "react";

import { type PanelDescriptor, useUltimateTraceViewStore } from "../store";
import PanelWrapper from "./panel-wrapper";

function parsePayload(payload: string): Record<string, unknown> {
  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

interface EventPayloadPanelProps {
  panel: PanelDescriptor;
}

export default function EventPayloadPanel({ panel }: EventPayloadPanelProps) {
  const closePanel = useUltimateTraceViewStore((state) => state.closePanel);
  const event = panel.data.event;

  const handleClose = useCallback(() => {
    closePanel(panel.key);
  }, [closePanel, panel.key]);

  const parsed = useMemo(() => (event ? parsePayload(event.payload) : {}), [event]);
  const entries = useMemo(() => Object.entries(parsed), [parsed]);
  const title = panel.data.title ?? "Event Payload";

  if (!event) {
    return (
      <PanelWrapper title={title} onClose={handleClose}>
        <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">No event data</div>
      </PanelWrapper>
    );
  }

  return (
    <PanelWrapper title={title} onClose={handleClose}>
      <div className="flex flex-col h-full overflow-y-auto">
        {/* Event metadata */}
        <div className="flex flex-col gap-1.5 px-3 py-2 border-b">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono rounded-md py-0.5 px-2 bg-muted">
              {new Date(event.timestamp).toLocaleString()}
            </span>
          </div>
          <div className="text-xs text-muted-foreground font-mono truncate">Signal: {event.signal_name}</div>
        </div>

        {/* Payload fields */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {entries.length === 0 ? (
            <div className="text-sm text-muted-foreground">Empty payload</div>
          ) : (
            entries.map(([key, value]) => (
              <div key={key} className="rounded-md border bg-secondary/50 px-3 py-2">
                <div className="text-xs text-muted-foreground mb-1">{key}</div>
                <div className="text-sm whitespace-pre-wrap break-words text-secondary-foreground">
                  {typeof value === "object" ? JSON.stringify(value, null, 2) : String(value ?? "")}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </PanelWrapper>
  );
}
