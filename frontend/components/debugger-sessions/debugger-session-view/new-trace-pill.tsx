"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

import { useDebuggerSessionViewStore } from "./store";

// "Close enough to the bottom" for self-dismissal — the article column has
// 160px of bottom padding, so within this slack the new trace card is in view.
const DISMISS_SLACK_PX = 160;

// Pill that appears centered at the bottom when a new run arrives via realtime
// (`trace_update` for an unknown trace sets `newTraceNotice`). Clicking the pill
// scrolls to the bottom of the session; the X dismisses without scrolling, and
// manually scrolling to the bottom dismisses too (the trace has been seen).
export default function NewTracePill({
  onScrollToBottom,
  scrollEl,
}: {
  onScrollToBottom: () => void;
  scrollEl: HTMLElement | null;
}) {
  const visible = useDebuggerSessionViewStore((s) => s.newTraceNotice);
  const dismiss = useDebuggerSessionViewStore((s) => s.dismissNewTraceNotice);

  useEffect(() => {
    if (!visible || !scrollEl) return;
    const onScroll = () => {
      if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - DISMISS_SLACK_PX) dismiss();
    };
    onScroll();
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollEl.removeEventListener("scroll", onScroll);
  }, [visible, scrollEl, dismiss]);

  if (!visible) return null;

  return (
    <div className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
      <div className="flex items-center overflow-hidden rounded-full border bg-primary shadow-md hover:bg-primary-300">
        <button
          type="button"
          className="pl-3 py-1.5 text-sm font-medium"
          onClick={() => {
            onScrollToBottom();
            dismiss();
          }}
        >
          New trace
        </button>
        <button type="button" aria-label="Dismiss" className="px-2 py-1.5 text-primary-foreground" onClick={dismiss}>
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
