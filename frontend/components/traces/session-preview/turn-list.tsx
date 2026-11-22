import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { type TraceRow } from "@/lib/traces/types";

import TurnRow from "./turn-row";

const ESTIMATED_ROW_HEIGHT = 56;

export default function TurnList({
  traces,
  currentTraceId,
  onSelect,
}: {
  traces: TraceRow[];
  currentTraceId?: string;
  onSelect: (traceId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: traces.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    getItemKey: (i) => traces[i]?.id ?? i,
    overscan: 8,
    paddingStart: 4,
    paddingEnd: 4,
  });
  const items = virtualizer.getVirtualItems();

  const currentIndex = currentTraceId ? traces.findIndex((t) => t.id === currentTraceId) : -1;
  useEffect(() => {
    if (currentIndex >= 0) virtualizer.scrollToIndex(currentIndex, { align: "center" });
  }, [currentIndex, virtualizer]);

  return (
    <ScrollArea ref={scrollRef} className="max-h-80" viewportClassName="max-h-80 [&>div]:!block">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        <div className="absolute left-0 top-0 w-full" style={{ transform: `translateY(${items[0]?.start ?? 0}px)` }}>
          {items.map((v) => (
            <div key={v.key} ref={virtualizer.measureElement} data-index={v.index}>
              <TurnRow trace={traces[v.index]} current={traces[v.index].id === currentTraceId} onSelect={onSelect} />
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}
