import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { useSessionViewStore } from "@/components/traces/session-view/store";
import TraceView from "@/components/traces/trace-view";
import { LeftEdgeResizeHandle } from "@/components/traces/trace-view/left-edge-resize-handle";
import { type TraceViewTrace } from "@/components/traces/trace-view/store";
import { usePanelResize } from "@/components/traces/trace-view/use-panel-resize";

import { useChatViewStore } from "./store";

const enterExitTransition = { duration: 0.25, ease: "easeOut" } as const;
const instantTransition = { duration: 0 } as const;

/**
 * The standard trace view for the opened turn, sliding in from the right like the
 * session span panel: the outer div animates width while the inner one stays pinned
 * at the target width, so content never reflows mid-animation. Left edge resizes.
 */
export default function TracePanel() {
  const { openTraceId, openSpanId, width, toggleTrace, resizeTrace, setContainerWidth } = useChatViewStore(
    useShallow((s) => ({
      openTraceId: s.openTraceId,
      openSpanId: s.openSpanId,
      width: s.traceWidth,
      toggleTrace: s.toggleTrace,
      resizeTrace: s.resizeTrace,
      setContainerWidth: s.setContainerWidth,
    }))
  );

  // Keep rendering the last trace while the exit animation plays.
  const [shown, setShown] = useState(openTraceId ? { traceId: openTraceId, spanId: openSpanId } : undefined);
  if (openTraceId && (openTraceId !== shown?.traceId || openSpanId !== shown?.spanId)) {
    setShown({ traceId: openTraceId, spanId: openSpanId });
  }

  const row = useSessionViewStore((s) => s.traces.find((t) => t.id === shown?.traceId));
  // Seeding TraceView from the session row skips its own trace fetch.
  const trace = useMemo<TraceViewTrace | undefined>(
    () =>
      row && { ...row, metadata: JSON.stringify(row.metadata ?? {}), visibility: "private", hasBrowserSession: false },
    [row]
  );

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
      {open && trace && shown && (
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
                key={`${shown.traceId}:${shown.spanId ?? ""}`}
                traceId={shown.traceId}
                spanId={shown.spanId}
                propsTrace={trace}
                storeKey="chat-session-trace-view-state"
                defaultTimelineEnabled={false}
                onClose={() => toggleTrace(undefined)}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
