import { useVirtualizer } from "@tanstack/react-virtual";
import { compact, isEmpty, times } from "lodash";
import { useParams } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { type TraceViewSpan, useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
import { Skeleton } from "@/components/ui/skeleton";

import MustacheTemplateSheet from "../list/mustache-template-sheet";
import { useBatchedSpanOutputs } from "../list/use-batched-span-outputs";
import { useScrollContext } from "../scroll-context";
import { type PathInfo } from "../trace-view-store-utils";
import { SpanCard } from "./span-card";

interface TreeProps {
  traceId: string;
  onSpanSelect: (span?: TraceViewSpan) => void;
  isShared?: boolean;
}

const Tree = ({ traceId, onSpanSelect, isShared = false }: TreeProps) => {
  const { projectId } = useParams<{ projectId: string }>();
  const { scrollRef, updateState } = useScrollContext();
  const { getTreeSpans, spans, trace, isSpansLoading } = useTraceViewStoreContext((state) => ({
    getTreeSpans: state.getTreeSpans,
    spans: state.spans,
    trace: state.trace,
    isSpansLoading: state.isSpansLoading,
  }));

  const treeSpans = useMemo(() => getTreeSpans(), [getTreeSpans, spans]);

  const [settingsSpan, setSettingsSpan] = useState<(TraceViewSpan & { pathInfo: PathInfo }) | null>(null);

  const virtualizer = useVirtualizer({
    count: treeSpans.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 10,
  });

  const items = virtualizer?.getVirtualItems() || [];

  const visibleSpanIds = compact(
    items.map((item) => {
      const spanItem = treeSpans[item.index];
      return spanItem && !spanItem.pending ? spanItem.span.spanId : null;
    })
  ) as string[];

  const { outputs } = useBatchedSpanOutputs(
    projectId,
    visibleSpanIds,
    {
      id: traceId,
      startTime: trace?.startTime,
      endTime: trace?.endTime,
    },
    { isShared }
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

  if (isSpansLoading) {
    return (
      <div className="flex flex-col gap-2 p-2 pb-4 w-full min-w-full">
        {times(3, (i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (isEmpty(treeSpans) && isEmpty(spans)) {
    return <span className="text-base text-secondary-foreground mx-auto mt-4 text-center">No spans found.</span>;
  }

  return (
    <div ref={scrollRef} className="overflow-x-hidden overflow-y-auto grow relative h-full w-full styled-scrollbar">
      <div className="flex flex-col pb-[100px] pt-1">
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
              const spanItem = treeSpans[virtualRow.index];
              if (!spanItem) return null;

              return (
                <div key={virtualRow.key} ref={virtualizer.measureElement} data-index={virtualRow.index}>
                  <SpanCard
                    span={spanItem.span}
                    branchMask={spanItem.branchMask}
                    output={outputs[spanItem.span.spanId]}
                    depth={spanItem.depth}
                    pathInfo={spanItem.pathInfo}
                    onSpanSelect={onSpanSelect}
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

export default memo(Tree);
