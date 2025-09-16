import { isEmpty } from "lodash";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Span, Trace } from "@/lib/traces/types";

import { SpanCard } from "../span-card";
import { useScrollContext } from "./scroll-context";

export interface TreeHandle {
  scrollTo: (position: number) => void;
}

interface TreeProps {
  topLevelSpans: Span[];
  childSpans: { [key: string]: Span[] };
  activeSpans: string[];
  collapsedSpans: Set<string>;
  containerWidth: number;
  selectedSpan: Span | null;
  trace: Trace | null;
  isSpansLoading: boolean;
  onToggleCollapse: (spanId: string) => void;
  onSpanSelect: (span: Span) => void;
  onSelectTime?: (time: number) => void;
}

const Tree = forwardRef<TreeHandle, TreeProps>(
  (
    {
      topLevelSpans,
      childSpans,
      activeSpans,
      collapsedSpans,
      containerWidth,
      selectedSpan,
      trace,
      isSpansLoading,
      onToggleCollapse,
      onSpanSelect,
      onSelectTime,
    },
    ref
  ) => {
    const { virtualizer, scrollRef, spanItems, renderProps, scrollTo, render, updateState } = useScrollContext();

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
    }, [scrollRef, virtualizer, updateState]);

    useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;

      el.addEventListener("scroll", handleScroll);

      handleScroll();

      return () => {
        el.removeEventListener("scroll", handleScroll);
      };
    }, [handleScroll, scrollRef.current]);

    useEffect(() => {
      render({
        topLevelSpans,
        childSpans,
        activeSpans,
        collapsedSpans,
        containerWidth,
        selectedSpan,
        trace,
        onToggleCollapse,
        onSpanSelect,
        onSelectTime,
      });
    }, [
      render,
      topLevelSpans,
      childSpans,
      activeSpans,
      collapsedSpans,
      containerWidth,
      selectedSpan,
      trace,
      onToggleCollapse,
      onSpanSelect,
      onSelectTime,
    ]);

    useImperativeHandle(
      ref,
      () => ({
        scrollTo: scrollTo,
      }),
      [scrollTo]
    );

    const items = virtualizer?.getVirtualItems() || [];

    if (isSpansLoading || !virtualizer || !renderProps) {
      return (
        <div className="flex flex-col gap-2 p-2 pb-4 w-full min-w-full">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      );
    }

    if (!isSpansLoading && isEmpty(topLevelSpans)) {
      return <span className="text-base text-secondary-foreground mx-auto mt-4 w-full">No spans found.</span>;
    }

    return (
      <ScrollArea ref={scrollRef} className="overflow-x-hidden flex-grow relative h-full w-full">
        <div className="flex flex-col pb-4 pt-1">
          <div
            className="relative"
            style={{
              height: virtualizer.getTotalSize(),
              width: "100%",
              position: "relative",
            }}
          >
            <div
              className="pl-6"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${items[0]?.start ?? 0}px)`,
              }}
            >
              {items.map((virtualRow) => {
                const spanItem = spanItems[virtualRow.index];
                if (!spanItem) return null;

                return (
                  <div key={virtualRow.key} ref={virtualizer.measureElement} data-index={virtualRow.index}>
                    <SpanCard
                      span={spanItem.span}
                      parentY={spanItem.parentY}
                      yOffset={spanItem.yOffset}
                      childSpans={renderProps.childSpans}
                      containerWidth={renderProps.containerWidth}
                      depth={spanItem.depth}
                      selectedSpan={renderProps.selectedSpan}
                      collapsedSpans={renderProps.collapsedSpans}
                      onSpanSelect={renderProps.onSpanSelect}
                      onToggleCollapse={renderProps.onToggleCollapse}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </ScrollArea>
    );
  }
);

Tree.displayName = "Tree";

export default Tree;
