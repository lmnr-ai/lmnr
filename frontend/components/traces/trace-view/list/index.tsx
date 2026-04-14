import { useVirtualizer } from "@tanstack/react-virtual";
import { isEmpty, times } from "lodash";
import { useParams } from "next/navigation";
import React, { useCallback, useMemo, useRef } from "react";

import { AgentGroupHeader } from "@/components/traces/trace-view/list/agent-group-item";
import ListItem from "@/components/traces/trace-view/list/list-item.tsx";
import { useBatchedSpanPreviews } from "@/components/traces/trace-view/list/use-batched-span-previews";
import { useTraceUserInput } from "@/components/traces/trace-view/list/use-trace-user-input";
import { UserInputItem } from "@/components/traces/trace-view/list/user-input-item";
import {
  type TraceViewListSpan,
  type TraceViewSpan,
  type TranscriptListGroup,
  useTraceViewBaseStore,
} from "@/components/traces/trace-view/store/base";
import { Skeleton } from "@/components/ui/skeleton.tsx";

interface ListProps {
  onSpanSelect: (span?: TraceViewSpan) => void;
  isShared?: boolean;
}

type FlatRow =
  | { type: "user-input" }
  | { type: "span"; span: TraceViewListSpan }
  | { type: "group-header"; group: TranscriptListGroup }
  | { type: "group-span"; span: TraceViewListSpan; group: TranscriptListGroup; isLast: boolean };

const List = ({ onSpanSelect, isShared = false }: ListProps) => {
  const { projectId } = useParams<{ projectId: string }>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    getTranscriptListData,
    spans,
    isSpansLoading,
    trace,
    condensedTimelineVisibleSpanIds,
    transcriptCollapsedGroups,
  } = useTraceViewBaseStore((state) => ({
    getTranscriptListData: state.getTranscriptListData,
    spans: state.spans,
    isSpansLoading: state.isSpansLoading,
    trace: state.trace,
    condensedTimelineVisibleSpanIds: state.condensedTimelineVisibleSpanIds,
    transcriptCollapsedGroups: state.transcriptCollapsedGroups,
  }));

  const transcriptEntries = useMemo(
    () => getTranscriptListData(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getTranscriptListData, spans, condensedTimelineVisibleSpanIds]
  );

  const { userInput, isLoading: isUserInputLoading } = useTraceUserInput(projectId, trace?.id, isShared);
  const hasUserInput = isUserInputLoading || !!userInput;

  const flatRows = useMemo(() => {
    const rows: FlatRow[] = [];
    if (hasUserInput) {
      rows.push({ type: "user-input" });
    }
    for (const entry of transcriptEntries) {
      if (entry.type === "span") {
        rows.push({ type: "span", span: entry.span });
      } else {
        rows.push({ type: "group-header", group: entry });
        const isCollapsed = !transcriptCollapsedGroups.has(entry.groupId);
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
  }, [transcriptEntries, transcriptCollapsedGroups, hasUserInput]);

  const spanTypes = useMemo(() => {
    const types: Record<string, string> = {};
    for (const entry of transcriptEntries) {
      if (entry.type === "span") {
        types[entry.span.spanId] = entry.span.spanType;
      } else {
        for (const s of entry.spans) {
          types[s.spanId] = s.spanType;
        }
      }
    }
    return types;
  }, [transcriptEntries]);

  const inputSpanIds = useMemo(() => {
    const ids: string[] = [];
    for (const entry of transcriptEntries) {
      if (entry.type === "group" && entry.firstLlmSpanId) {
        ids.push(entry.firstLlmSpanId);
      }
    }
    return ids;
  }, [transcriptEntries]);

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 123,
    overscan: 20,
  });

  const items = virtualizer.getVirtualItems();

  const allVisibleSpanIds = useMemo(() => {
    const ids: string[] = [];
    for (const item of items) {
      const row = flatRows[item.index];
      if (!row) continue;
      if (row.type === "span" || row.type === "group-span") {
        ids.push(row.span.spanId);
      } else if (row.type === "group-header") {
        const firstSpan = row.group.spans[0];
        if (firstSpan) ids.push(firstSpan.spanId);
        if (row.group.firstLlmSpanId && row.group.firstLlmSpanId !== firstSpan?.spanId) {
          ids.push(row.group.firstLlmSpanId);
        }
      }
    }
    return ids;
  }, [items, flatRows]);

  const { previews } = useBatchedSpanPreviews(
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

  const hasEntries = transcriptEntries.length > 0;

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
            : "No matching spans found. Transcript mode omits default span types. Switch to tree view to see all spans."}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="grow h-full w-full styled-scrollbar overflow-x-hidden relative"
      style={{
        overflowY: "auto",
        overflowX: "hidden",
        contain: "strict",
        overflowAnchor: "none",
      }}
    >
      <div
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

            if (row.type === "user-input") {
              return (
                <div key={virtualRow.key} data-index={virtualRow.index} ref={virtualizer.measureElement}>
                  <UserInputItem text={userInput} isLoading={isUserInputLoading} />
                </div>
              );
            }

            if (row.type === "group-header") {
              const isCollapsed = !transcriptCollapsedGroups.has(row.group.groupId);
              const firstSpan = row.group.spans[0];
              const firstSpanIsLlm = firstSpan && (firstSpan.spanType === "LLM" || firstSpan.spanType === "CACHED");
              const previewSpanId =
                firstSpanIsLlm && row.group.firstLlmSpanId ? row.group.firstLlmSpanId : firstSpan?.spanId;
              const groupPreview = previewSpanId ? previews[previewSpanId] : null;
              return (
                <div key={virtualRow.key} data-index={virtualRow.index} ref={virtualizer.measureElement}>
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
                <div key={virtualRow.key} data-index={virtualRow.index} ref={virtualizer.measureElement}>
                  <div className={`mx-2 border-x bg-muted/50 ${row.isLast ? "border-b rounded-b-lg mb-1" : ""}`}>
                    <ListItem span={row.span} output={previews[row.span.spanId]} onSpanSelect={handleSpanSelect} />
                  </div>
                </div>
              );
            }

            return (
              <div key={virtualRow.key} data-index={virtualRow.index} ref={virtualizer.measureElement}>
                <ListItem span={row.span} output={previews[row.span.spanId]} onSpanSelect={handleSpanSelect} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default List;
