import { useVirtualizer } from "@tanstack/react-virtual";
import { isEmpty, isNil, isNull, times } from "lodash";
import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef } from "react";

import { AgentGroupHeader } from "@/components/traces/trace-view/list/agent-group-item";
import ListItem from "@/components/traces/trace-view/list/list-item.tsx";
import { useBatchedSpanPreviews } from "@/components/traces/trace-view/list/use-batched-span-previews";
import { useTraceUserInput } from "@/components/traces/trace-view/list/use-trace-user-input";
import { UserInputItem } from "@/components/traces/trace-view/list/user-input-item";
import {
  type ReaderListGroup,
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

type FlatRow =
  | { type: "span"; span: TraceViewListSpan }
  | { type: "group-header"; group: ReaderListGroup }
  | { type: "group-span"; span: TraceViewListSpan; group: ReaderListGroup; isLast: boolean };

const List = ({ onSpanSelect, isShared = false }: ListProps) => {
  const { projectId } = useParams<{ projectId: string }>();
  const { scrollRef, updateState, setVisibleSpanIds } = useScrollContext();
  const {
    getReaderListData,
    spans,
    isSpansLoading,
    selectedSpan,
    trace,
    condensedTimelineVisibleSpanIds,
    readerCollapsedGroups,
    agentPaths,
  } = useTraceViewBaseStore((state) => ({
    getReaderListData: state.getReaderListData,
    spans: state.spans,
    isSpansLoading: state.isSpansLoading,
    selectedSpan: state.selectedSpan,
    trace: state.trace,
    condensedTimelineVisibleSpanIds: state.condensedTimelineVisibleSpanIds,
    readerCollapsedGroups: state.readerCollapsedGroups,
    agentPaths: state.agentPaths,
  }));

  const prevVisibleIdsRef = useRef<string>("");

  const readerEntries = useMemo(
    () => getReaderListData(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getReaderListData, spans, condensedTimelineVisibleSpanIds, agentPaths]
  );

  const flatRows = useMemo(() => {
    const rows: FlatRow[] = [];
    for (const entry of readerEntries) {
      if (entry.type === "span") {
        rows.push({ type: "span", span: entry.span });
      } else {
        rows.push({ type: "group-header", group: entry });
        const isCollapsed = !readerCollapsedGroups.has(entry.groupId);
        if (!isCollapsed) {
          const childSpans = entry.spans.slice(1);
          for (let i = 0; i < childSpans.length; i++) {
            rows.push({
              type: "group-span",
              span: childSpans[i],
              group: entry,
              isLast: i === childSpans.length - 1,
            });
          }
        }
      }
    }
    return rows;
  }, [readerEntries, readerCollapsedGroups]);

  const spanTypes = useMemo(() => {
    const types: Record<string, string> = {};
    for (const entry of readerEntries) {
      if (entry.type === "span") {
        types[entry.span.spanId] = entry.span.spanType;
      } else {
        for (const s of entry.spans) {
          types[s.spanId] = s.spanType;
        }
      }
    }
    return types;
  }, [readerEntries]);

  const inputSpanIds = useMemo(() => {
    const ids: string[] = [];
    for (const entry of readerEntries) {
      if (entry.type === "group" && entry.firstLlmSpanId) {
        ids.push(entry.firstLlmSpanId);
      }
    }
    return ids;
  }, [readerEntries]);

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 42,
    overscan: 20,
  });

  const selectedSpanIndex = useMemo(() => {
    if (isNil(selectedSpan)) return null;
    return flatRows.findIndex((row) => {
      if (row.type === "group-header") return false;
      return row.span.spanId === selectedSpan.spanId;
    });
  }, [selectedSpan?.spanId, flatRows]);

  useEffect(() => {
    if (isNull(selectedSpanIndex) || isSpansLoading) return;
    if (selectedSpanIndex !== -1) {
      const rafId = requestAnimationFrame(() => {
        virtualizer.scrollToIndex(selectedSpanIndex, { align: "auto" });
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [selectedSpanIndex, virtualizer, isSpansLoading]);

  const items = virtualizer?.getVirtualItems() || [];

  const allVisibleSpanIds = useMemo(() => {
    const ids: string[] = [];
    for (const item of items) {
      const row = flatRows[item.index];
      if (!row) continue;
      if (row.type === "span" || row.type === "group-span") {
        ids.push(row.span.spanId);
      } else if (row.type === "group-header") {
        for (const s of row.group.spans) {
          ids.push(s.spanId);
        }
      }
    }
    return ids;
  }, [items, flatRows]);

  const { previews, userInputs } = useBatchedSpanPreviews(
    projectId,
    allVisibleSpanIds,
    {
      id: trace?.id,
      startTime: trace?.startTime,
      endTime: trace?.endTime,
    },
    { isShared },
    spanTypes,
    inputSpanIds
  );

  const { userInput, isLoading: isUserInputLoading } = useTraceUserInput(projectId, trace?.id, isShared);

  useEffect(() => {
    const currentIdsKey = allVisibleSpanIds.join(",");
    if (prevVisibleIdsRef.current !== currentIdsKey) {
      prevVisibleIdsRef.current = currentIdsKey;
      setVisibleSpanIds(allVisibleSpanIds);
    }
  }, [allVisibleSpanIds, setVisibleSpanIds]);

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
    (listSpan: TraceViewListSpan) => {
      if (listSpan.pending) return;
      const fullSpan = spans.find((s) => s.spanId === listSpan.spanId);
      if (fullSpan) {
        onSpanSelect(fullSpan);
      }
    },
    [spans, onSpanSelect]
  );

  const hasEntries = readerEntries.length > 0;

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

  if (!hasEntries) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <span className="text-base text-secondary-foreground">
          {isEmpty(spans)
            ? "No spans found."
            : "No matching spans found. Reader mode omits default span types. Switch to tree view to see all spans."}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="overflow-x-hidden overflow-y-auto grow relative h-full w-full styled-scrollbar pb-4"
    >
      <div className="flex flex-col">
        <UserInputItem text={userInput} isLoading={isUserInputLoading} />
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
              const row = flatRows[virtualRow.index];
              if (!row) return null;

              if (row.type === "group-header") {
                const isCollapsed = !readerCollapsedGroups.has(row.group.groupId);
                const firstSpan = row.group.spans[0];
                const firstSpanIsLlm = firstSpan && (firstSpan.spanType === "LLM" || firstSpan.spanType === "CACHED");
                const groupPreview = firstSpan
                  ? firstSpanIsLlm && row.group.firstLlmSpanId
                    ? userInputs[row.group.firstLlmSpanId]
                    : previews[firstSpan.spanId]
                  : null;
                return (
                  <div key={virtualRow.key} ref={virtualizer.measureElement} data-index={virtualRow.index}>
                    <AgentGroupHeader
                      group={row.group}
                      collapsed={isCollapsed}
                      preview={groupPreview}
                      onSpanSelect={handleSpanSelect}
                    />
                  </div>
                );
              }

              if (row.type === "group-span") {
                return (
                  <div key={virtualRow.key} ref={virtualizer.measureElement} data-index={virtualRow.index}>
                    <div className={`mx-2 border-x bg-muted/80 ${row.isLast ? "border-b rounded-b-lg mb-1" : ""}`}>
                      <ListItem span={row.span} output={previews[row.span.spanId]} onSpanSelect={handleSpanSelect} />
                    </div>
                  </div>
                );
              }

              return (
                <div key={virtualRow.key} ref={virtualizer.measureElement} data-index={virtualRow.index}>
                  <ListItem span={row.span} output={previews[row.span.spanId]} onSpanSelect={handleSpanSelect} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default List;
