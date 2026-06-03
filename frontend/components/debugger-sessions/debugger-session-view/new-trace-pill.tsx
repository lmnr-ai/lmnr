"use client";

import { X } from "lucide-react";

import { useDebuggerSessionViewStore } from "./store";

// Pill that appears centered at the bottom when a new run arrives via realtime
// (`trace_update` for an unknown trace sets `newTraceNotice`). Clicking the pill
// scrolls to the bottom of the session; the X dismisses without scrolling.
export default function NewTracePill({ onScrollToBottom }: { onScrollToBottom: () => void }) {
  const visible = useDebuggerSessionViewStore((s) => s.newTraceNotice);
  const dismiss = useDebuggerSessionViewStore((s) => s.dismissNewTraceNotice);

  if (!visible) return null;

  return (
    <div className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
      <div className="flex items-center overflow-hidden rounded-full border bg-background shadow-md">
        <button
          type="button"
          className="px-3 py-1.5 text-sm font-medium hover:bg-muted"
          onClick={() => {
            onScrollToBottom();
            dismiss();
          }}
        >
          New trace
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          className="border-l px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={dismiss}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
