import { useUltimateTraceViewStore } from "../store";
import EventPayloadPanel from "./event-payload-panel";
import SpanListPanel from "./span-list-panel";
import SpanViewPanel from "./span-view-panel";

export default function PanelContainer() {
  const panels = useUltimateTraceViewStore((state) => state.panels);

  if (panels.length === 0) return null;

  return (
    <div className="fixed right-4 top-14 bottom-4 z-50 flex flex-row gap-2 pointer-events-none">
      {panels.map((panel) => {
        switch (panel.type) {
          case "span-list":
            return (
              <div key={panel.key} className="pointer-events-auto">
                <SpanListPanel panel={panel} />
              </div>
            );
          case "span-view":
            return (
              <div key={panel.key} className="pointer-events-auto">
                <SpanViewPanel panel={panel} />
              </div>
            );
          case "event-payload":
            return (
              <div key={panel.key} className="pointer-events-auto">
                <EventPayloadPanel panel={panel} />
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
