"use client";

import { X } from "lucide-react";

import { SpanView, type SpanViewTab } from "@/components/traces/span-view";
import { SpanViewSkeleton } from "@/components/traces/span-view/skeleton";
import TraceViewStoreProvider from "@/components/traces/trace-view/store";
import { Button } from "@/components/ui/button";

import { useSessionViewStore } from "./store";

/**
 * Span panel for the session view. Per spec the session view's OWN state does
 * not live in the trace-view store — but `<SpanView>` (via `SpanControls`)
 * reads `setSelectedSpan`/`isAlwaysSelectSpan` from that context, so we mount
 * a disposable `TraceViewStoreProvider` purely as plumbing.
 *
 * We pass `isAlwaysSelectSpan=true` so SpanControls' built-in X button is
 * hidden, and render our own close button that drives the session-view store.
 */
export default function SessionSpanPanel() {
  const { selection, setSpanPanelOpen } = useSessionViewStore((s) => ({
    selection: s.selectedSpan,
    setSpanPanelOpen: s.setSpanPanelOpen,
  }));

  if (!selection) {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden flex-1 border-r">
        <div className="flex items-center justify-end h-10 px-3 border-b shrink-0">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSpanPanelOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <SpanViewSkeleton />
      </div>
    );
  }

  const snippetTab: SpanViewTab = "span-input";

  return (
    <TraceViewStoreProvider
      key={`${selection.traceId}::${selection.spanId}`}
      storeKey="session-view-inner-span"
      isAlwaysSelectSpan
    >
      <div className="flex flex-col h-full w-full overflow-hidden flex-1 border-r">
        <div className="flex items-center justify-end h-10 px-3 border-b shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setSpanPanelOpen(false)}
            aria-label="Close span panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-hidden">
          <SpanView
            key={selection.spanId}
            spanId={selection.spanId}
            traceId={selection.traceId}
            initialTab={snippetTab}
          />
        </div>
      </div>
    </TraceViewStoreProvider>
  );
}
