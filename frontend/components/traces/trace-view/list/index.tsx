import { useVirtualizer } from "@tanstack/react-virtual";
import { compact, isEmpty, isNil, isNull, times } from "lodash";
import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ListItem from "@/components/traces/trace-view/list/list-item.tsx";
import MustacheTemplateSheet from "@/components/traces/trace-view/list/mustache-template-sheet.tsx";
import { useBatchedSpanOutputs } from "@/components/traces/trace-view/list/use-batched-span-outputs";
import {
  type TraceViewListSpan,
  type TraceViewSpan,
  useTraceViewBaseStore,
} from "@/components/traces/trace-view/store/base";
import { Skeleton } from "@/components/ui/skeleton.tsx";

import { useScrollContext } from "../scroll-context.tsx";

interface ListProps {
  onSpanSelect: (span?: TraceViewSpan) => void;
  isShared?: boolean;
}

const List = ({ onSpanSelect, isShared = false }: ListProps) => {
  const { projectId } = useParams<{ projectId: string }>();
  const { scrollRef, updateState, setVisibleSpanIds } = useScrollContext();
  const { getListData, spans, isSpansLoading, selectedSpan, trace, condensedTimelineVisibleSpanIds } =
    useTraceViewBaseStore((state) => ({
      getListData: state.getListData,
      spans: state.spans,
      isSpansLoading: state.isSpansLoading,
      selectedSpan: state.selectedSpan,
      trace: state.trace,
      condensedTimelineVisibleSpanIds: state.condensedTimelineVisibleSpanIds,
    }));

  const prevVisibleIdsRef = useRef<string>("");
  const [settingsSpan, setSettingsSpan] = useState<TraceViewListSpan | null>(null);

  const listSpans = useMemo(() => getListData(), [getListData, spans, condensedTimelineVisibleSpanIds]);

  const virtualizer = useVirtualizer({
    count: listSpans.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 291,
    overscan: 20,
  });

  const selectedSpanIndex = useMemo(() => {
    if (isNil(selectedSpan)) return null;
    const selectedIndex = listSpans.findIndex((span) => span.spanId === selectedSpan.spanId);
    return selectedIndex;
  }, [selectedSpan?.spanId, listSpans]);

  // Scroll to selected span when selection changes
  useEffect(() => {
    if (isNull(selectedSpanIndex) || isSpansLoading) return;
    if (selectedSpanIndex !== -1) {
      const rafId = requestAnimationFrame(() => {
        virtualizer.scrollToIndex(selectedSpanIndex, { align: "start" });
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [selectedSpanIndex, virtualizer, isSpansLoading]);

  const items = virtualizer?.getVirtualItems() || [];

  const visibleSpanIds = compact(items.map((item) => listSpans[item.index]?.spanId)) as string[];

  const { outputs } = useBatchedSpanOutputs(
    projectId,
    // Fetches outputs for visible or rendered spans in virtualized list.
    // Make sure that spans in view (~20) + overscan spans < cache size (default 100) in this hook.
    visibleSpanIds,
    {
      id: trace?.id,
      startTime: trace?.startTime,
      endTime: trace?.endTime,
    },
    { isShared }
  );

  useEffect(() => {
    const currentIdsKey = visibleSpanIds.join(",");
    if (prevVisibleIdsRef.current !== currentIdsKey) {
      prevVisibleIdsRef.current = currentIdsKey;
      setVisibleSpanIds(visibleSpanIds);
    }
  }, [visibleSpanIds, setVisibleSpanIds]);

  useEffect(
    () => () => {
      setVisibleSpanIds([]);
      prevVisibleIdsRef.current = "";
    },
    [setVisibleSpanIds]
  );

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !virtualizer) return;

    const newState = {
      totalHeight: virtualizer.getTotalSize(),
      viewportHeight: el.clientHeight,
      scrollTop: el.scrollTop,
    };

    if (Object.values(newState).every((val) => isFinite(val) && val >= 0)) {
      updateState(newState);
    }
  }, [scrollRef, updateState, virtualizer]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener("scroll", handleScroll);
    handleScroll();

    return () => {
      el.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll, scrollRef?.current]);

  const handleSpanSelect = useCallback(
    (listSpan: (typeof listSpans)[0]) => {
      if (listSpan.pending) return;
      const fullSpan = spans.find((s) => s.spanId === listSpan.spanId);
      if (fullSpan) {
        onSpanSelect(fullSpan);
      }
    },
    [spans, onSpanSelect]
  );

  if (isSpansLoading) {
    return (
      <div className="flex flex-1 flex-col">
        {times(3, (i) => (
          <div key={i} className="flex flex-col gap-2 w-full px-3 py-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-60 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (isEmpty(listSpans)) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <span className="text-base text-secondary-foreground">No spans found.</span>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="overflow-x-hidden overflow-y-auto grow relative h-full w-full styled-scrollbar pb-4"
    >
      <div className="flex flex-col">
        <div
          className="relative"
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${items[0]?.start ?? 0}px)`,
            }}
          >
            {items.map((virtualRow) => {
              const listSpan = listSpans[virtualRow.index];
              if (!listSpan) return null;

              const nextSpan = listSpans[virtualRow.index + 1];
              const isLast = !nextSpan || nextSpan.spanType === "LLM";

              return (
                <div key={virtualRow.key} ref={virtualizer.measureElement} data-index={virtualRow.index}>
                  <ListItem
                    isFirst={virtualRow.index === 0}
                    isLast={isLast}
                    span={listSpan}
                    output={outputs[listSpan.spanId]}
                    onSpanSelect={handleSpanSelect}
                    onOpenSettings={setSettingsSpan}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <MustacheTemplateSheet
        span={settingsSpan}
        output={outputs[settingsSpan?.spanId ?? ""]}
        open={!!settingsSpan}
        onOpenChange={(open) => !open && setSettingsSpan(null)}
      />
    </div>
  );
};

export default List;
