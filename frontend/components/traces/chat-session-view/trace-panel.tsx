import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import TraceView from "@/components/traces/trace-view";
import { LeftEdgeResizeHandle } from "@/components/traces/trace-view/left-edge-resize-handle";
import { usePanelResize } from "@/components/traces/trace-view/use-panel-resize";

import { useChatViewStore } from "./store";
import { useOpenTrace } from "./use-open-trace";

const enterExitTransition = { duration: 0.25, ease: "easeOut" } as const;
const instantTransition = { duration: 0 } as const;

/**
 * The standard trace view for the opened turn, sliding in from the right like the
 * session span panel: the outer div animates width while the inner one stays pinned
 * at the target width, so content never reflows mid-animation. Left edge resizes.
 */
export default function TracePanel() {
  const { openTraceId, openSpanId, closeTrace } = useOpenTrace();
  const { width, resizeTrace, setContainerWidth } = useChatViewStore(
    useShallow((s) => ({
      width: s.traceWidth,
      resizeTrace: s.resizeTrace,
      setContainerWidth: s.setContainerWidth,
    }))
  );

  // Keep rendering the last trace while the exit animation plays.
  const [shown, setShown] = useState(openTraceId ? { traceId: openTraceId, spanId: openSpanId } : undefined);
  if (openTraceId && (openTraceId !== shown?.traceId || openSpanId !== shown?.spanId)) {
    setShown({ traceId: openTraceId, spanId: openSpanId });
  }

  const onResize = useCallback((_: unknown, delta: number) => resizeTrace(delta), [resizeTrace]);
  const { handlePointerDown, isResizing } = usePanelResize("trace", onResize);

  // Clamp to the row this panel sits in, leaving room for the thread.
  const panelRef = useRef<HTMLDivElement>(null);
  const open = Boolean(openTraceId);
  useEffect(() => {
    const parent = panelRef.current?.parentElement;
    if (!open || !parent) return;
    const observer = new ResizeObserver(([entry]) => entry && setContainerWidth(entry.contentRect.width));
    observer.observe(parent);
    return () => observer.disconnect();
  }, [open, setContainerWidth]);

  return (
    <AnimatePresence initial={false}>
      {open && shown && (
        <motion.div
          key="chat-trace-panel"
          ref={panelRef}
          className="relative h-full flex-shrink-0 overflow-hidden bg-background"
          initial={{ width: 0, opacity: 0.5 }}
          animate={{ width, opacity: 1 }}
          exit={{ width: 0, opacity: 0.5 }}
          transition={isResizing ? instantTransition : enterExitTransition}
        >
          <div className="absolute inset-y-0 left-0 flex" style={{ width }}>
            <LeftEdgeResizeHandle onPointerDown={handlePointerDown} />
            <div className="flex h-full min-w-0 flex-1 overflow-hidden">
              <TraceView
                // Per trace only: a new spanId selects that span in the mounted view.
                key={shown.traceId}
                traceId={shown.traceId}
                spanId={shown.spanId}
                storeKey="chat-session-trace-view-state"
                defaultTimelineEnabled={false}
                onClose={closeTrace}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
