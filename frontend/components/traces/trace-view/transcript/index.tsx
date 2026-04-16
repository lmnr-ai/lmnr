import { useVirtualizer } from "@tanstack/react-virtual";
import { isEmpty, times } from "lodash";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useRef } from "react";

import {
  type TraceViewListSpan,
  type TraceViewSpan,
  type TranscriptListEntry,
  useTraceViewBaseStore,
} from "@/components/traces/trace-view/store/base";
import {
  AgentGroupHeader,
  GroupChildWrapper,
  InputItem,
  SpanItem,
} from "@/components/traces/trace-view/transcript/item";
import { useBatchedSpanPreviews } from "@/components/traces/trace-view/transcript/use-batched-span-previews";
import { useTraceUserInput } from "@/components/traces/trace-view/transcript/use-trace-user-input";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils";

interface ListProps {
  onSpanSelect: (span?: TraceViewSpan) => void;
  isShared?: boolean;
}

type FlatRow = { type: "user-input" } | TranscriptListEntry;

function getSpanIdsForRow(row: FlatRow, expandedGroups: Set<string>): string[] {
  switch (row.type) {
    case "span":
    case "group-span":
      return [row.span.spanId];
    case "group": {
      const ids: string[] = [row.firstSpan.spanId];
      if (row.firstLlmSpanId && row.firstLlmSpanId !== row.firstSpan.spanId) {
        ids.push(row.firstLlmSpanId);
      }
      const isCollapsed = !expandedGroups.has(row.groupId);
      if (isCollapsed && row.lastLlmSpanId) {
        ids.push(row.lastLlmSpanId);
      }
      return ids;
    }
    default:
      return [];
  }
}

const List = ({ onSpanSelect, isShared = false }: ListProps) => {
  const { projectId } = useParams<{ projectId: string }>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    getTranscriptListData,
    spans,
    isSpansLoading,
    trace,
    selectedSpan,
    condensedTimelineVisibleSpanIds,
    transcriptExpandedGroups,
    toggleTranscriptGroup,
  } = useTraceViewBaseStore((state) => ({
    getTranscriptListData: state.getTranscriptListData,
    spans: state.spans,
    isSpansLoading: state.isSpansLoading,
    trace: state.trace,
    selectedSpan: state.selectedSpan,
    condensedTimelineVisibleSpanIds: state.condensedTimelineVisibleSpanIds,
    transcriptExpandedGroups: state.transcriptExpandedGroups,
    toggleTranscriptGroup: state.toggleTranscriptGroup,
  }));

  const spansById = useMemo(() => {
    const map = new Map<string, TraceViewSpan>();
    for (const s of spans) map.set(s.spanId, s);
    return map;
  }, [spans]);

  const transcriptEntries = useMemo(
    () => getTranscriptListData(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getTranscriptListData, spans, condensedTimelineVisibleSpanIds]
  );

  const hasLlmSpan = useMemo(() => spans.some((s) => s.spanType === "LLM" || s.spanType === "CACHED"), [spans]);

  const { userInput, isLoading: isUserInputLoading } = useTraceUserInput(projectId, trace?.id, isShared, hasLlmSpan);
  const hasUserInput = hasLlmSpan || isUserInputLoading || !!userInput;

  const flatRows = useMemo(() => {
    const rows: FlatRow[] = [];
    if (hasUserInput) {
      rows.push({ type: "user-input" });
    }
    const collapsedGroupIds = new Set<string>();
    for (const entry of transcriptEntries) {
      if (entry.type === "group") {
        rows.push(entry);
        if (!transcriptExpandedGroups.has(entry.groupId)) {
          collapsedGroupIds.add(entry.groupId);
        }
      } else if (entry.type === "group-span" || entry.type === "group-input") {
        if (!collapsedGroupIds.has(entry.groupId)) {
          rows.push(entry);
        }
      } else {
        rows.push(entry);
      }
    }
    return rows;
  }, [transcriptEntries, transcriptExpandedGroups, hasUserInput]);

  const spanTypes = useMemo(() => {
    const types: Record<string, string> = {};
    for (const entry of transcriptEntries) {
      if (entry.type === "span" || entry.type === "group-span") {
        types[entry.span.spanId] = entry.span.spanType;
      } else if (entry.type === "group") {
        types[entry.firstSpan.spanId] = entry.firstSpan.spanType;
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
    estimateSize: () => 186,
    overscan: 20,
    paddingEnd: 64,
  });

  const items = virtualizer.getVirtualItems();

  const allVisibleSpanIds = useMemo(
    () =>
      items.flatMap((item) => {
        const row = flatRows[item.index];
        return row ? getSpanIdsForRow(row, transcriptExpandedGroups) : [];
      }),
    [items, flatRows, transcriptExpandedGroups]
  );

  const {
    previews,
    userInputs: inputPreviews,
    agentNames,
  } = useBatchedSpanPreviews(
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
      const full = spansById.get(listSpan.spanId);
      if (full) onSpanSelect(full);
    },
    [onSpanSelect, spansById]
  );

  const renderRow = useCallback(
    (row: FlatRow) => {
      switch (row.type) {
        case "user-input":
          return <InputItem text={userInput} isLoading={isUserInputLoading} />;

        case "group": {
          const isCollapsed = !transcriptExpandedGroups.has(row.groupId);
          return (
            <AgentGroupHeader
              group={row}
              collapsed={isCollapsed}
              previews={previews}
              inputPreviews={inputPreviews}
              agentNames={agentNames}
              onToggle={() => toggleTranscriptGroup(row.groupId)}
            />
          );
        }

        case "group-input": {
          const inputText = inputPreviews[row.firstLlmSpanId] ?? null;
          const isLoadingInput = inputPreviews[row.firstLlmSpanId] === undefined;
          return (
            <GroupChildWrapper>
              <InputItem text={inputText} isLoading={isLoadingInput} inGroup />
            </GroupChildWrapper>
          );
        }

        case "group-span":
          return (
            <GroupChildWrapper isLast={row.isLast}>
              <SpanItem
                span={row.span}
                fullSpan={spansById.get(row.span.spanId)}
                output={previews[row.span.spanId]}
                onSpanSelect={handleSpanSelect}
                isSelected={selectedSpan?.spanId === row.span.spanId}
                inGroup
              />
            </GroupChildWrapper>
          );

        case "span":
          return (
            <SpanItem
              span={row.span}
              fullSpan={spansById.get(row.span.spanId)}
              output={previews[row.span.spanId]}
              onSpanSelect={handleSpanSelect}
              isSelected={selectedSpan?.spanId === row.span.spanId}
            />
          );
      }
    },
    [
      userInput,
      isUserInputLoading,
      transcriptExpandedGroups,
      toggleTranscriptGroup,
      previews,
      inputPreviews,
      agentNames,
      handleSpanSelect,
      selectedSpan,
      spansById,
    ]
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
            const isTopLevel = row.type === "group" || row.type === "span" || row.type === "user-input";
            const isFirst = virtualRow.index === 0;
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className={cn(isTopLevel && !isFirst && "pt-2")}
              >
                {renderRow(row)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default List;
