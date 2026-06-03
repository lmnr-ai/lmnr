"use client";

import { SpanView, type SpanViewTab } from "@/components/traces/span-view";
import { SpanViewSkeleton } from "@/components/traces/span-view/skeleton";

import { useSessionViewBaseStore } from "./store";

export default function SessionSpanPanel() {
  const { selection, setSpanPanelOpen } = useSessionViewBaseStore((s) => ({
    selection: s.selectedSpan,
    setSpanPanelOpen: s.setSpanPanelOpen,
  }));

  if (!selection) {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden flex-1">
        <SpanViewSkeleton />
      </div>
    );
  }

  const snippetTab: SpanViewTab = "span-input";

  return (
    <div className="flex flex-col h-full w-full overflow-hidden flex-1">
      <SpanView
        key={selection.spanId}
        spanId={selection.spanId}
        traceId={selection.traceId}
        initialTab={snippetTab}
        onClose={() => setSpanPanelOpen(false)}
      />
    </div>
  );
}
