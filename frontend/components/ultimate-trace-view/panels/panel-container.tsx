import { AnimatePresence, motion } from "framer-motion";

import { useUltimateTraceViewStore } from "../store";
import EventPayloadPanel from "./event-payload-panel";
import SpanListPanel from "./span-list-panel";
import SpanViewPanel from "./span-view-panel";
import TracePickerPanel from "./trace-picker-panel";

const panelAnimation = {
  initial: { opacity: 0, x: 40 },
  animate: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 30, mass: 0.4 } },
  exit: { opacity: 0, x: 40, transition: { duration: 0.15, ease: "easeOut" } },
};

export default function PanelContainer() {
  const panels = useUltimateTraceViewStore((state) => state.panels);

  if (panels.length === 0) return null;

  return (
    <div className="fixed right-4 top-14 bottom-4 z-50 flex flex-row gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {panels.map((panel) => {
          const content = (() => {
            switch (panel.type) {
              case "span-list":
                return <SpanListPanel panel={panel} />;
              case "span-view":
                return <SpanViewPanel panel={panel} />;
              case "event-payload":
                return <EventPayloadPanel panel={panel} />;
              case "trace-picker":
                return <TracePickerPanel panel={panel} />;
              default:
                return null;
            }
          })();

          return (
            <motion.div key={panel.key} className="pointer-events-auto" layout {...panelAnimation}>
              {content}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
