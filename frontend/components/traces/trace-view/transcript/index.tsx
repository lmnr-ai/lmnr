import { defaultRangeExtractor, type Range, useVirtualizer } from "@tanstack/react-virtual";
import { isEmpty, times } from "lodash";
import { ListTree } from "lucide-react";
import { useParams } from "next/navigation";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";

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
import {
  filterToViewport,
  useReportVisibleTimeRange,
} from "@/components/traces/trace-view/use-report-visible-time-range";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { track } from "@/lib/posthog";
import { cn } from "@/lib/utils.ts";

interface TranscriptProps {
  onSpanSelect: (span?: TraceViewSpan) => void;
  isShared?: boolean;
}

type FlatRow = { type: "user-input" } | TranscriptListEntry;

const isGroupChildType = (type: FlatRow["type"]): boolean => type === "group-span" || type === "group-input";

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

const Transcript = ({ onSpanSelect, isShared = false }: TranscriptProps) => {
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
    setTab,
    setScrollTimeRange,
    scrollToGroupId,
    consumeScrollToGroup,
  } = useTraceViewBaseStore(
    (state) => ({
      getTranscriptListData: state.getTranscriptListData,
      spans: state.spans,
      isSpansLoading: state.isSpansLoading,
      trace: state.trace,
      selectedSpan: state.selectedSpan,
      condensedTimelineVisibleSpanIds: state.condensedTimelineVisibleSpanIds,
      transcriptExpandedGroups: state.transcriptExpandedGroups,
      toggleTranscriptGroup: state.toggleTranscriptGroup,
      setTab: state.setTab,
      setScrollTimeRange: state.setScrollTimeRange,
      scrollToGroupId: state.scrollToGroupId,
      consumeScrollToGroup: state.consumeScrollToGroup,
    }),
    shallow
  );

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

  const llmSpanCount = useMemo(
    () => spans.filter((s) => s.spanType === "LLM" || s.spanType === "CACHED").length,
    [spans]
  );

  const trackedTraceIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const traceId = trace?.id;
    if (!traceId || spans.length === 0) return;
    if (trackedTraceIdRef.current === traceId) return;
    trackedTraceIdRef.current = traceId;
    const subagentGroupCount = transcriptEntries.filter((e) => e.type === "group").length;
    track("traces", "transcript_viewed", {
      subagent_group_count: subagentGroupCount,
      has_subagent_groups: subagentGroupCount > 0,
      is_shared: isShared,
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trace?.id, spans.length]);

  const { userInput, isLoading: isUserInputLoading } = useTraceUserInput(projectId, trace?.id, isShared, llmSpanCount);
  // Render the user-input row whenever we know an LLM span exists (even while
  // its content is still being fetched). This makes the input appear as soon
  // as the first LLM span arrives over realtime.
  const hasUserInput = llmSpanCount > 0 || isUserInputLoading || !!userInput;

  const flatRows = useMemo(() => {
    const rows: FlatRow[] = [];
    if (hasUserInput) {
      rows.push({ type: "user-input" });
    }
    for (const entry of transcriptEntries) {
      if (entry.type === "group") {
        rows.push(entry);
      } else if (entry.type === "group-span" || entry.type === "group-input") {
        if (transcriptExpandedGroups.has(entry.groupId)) {
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
    const spanMap = new Map(spans.map((s) => [s.spanId, s]));
    const setType = (id: string | null | undefined) => {
      if (!id) return;
      const s = spanMap.get(id);
      if (s) types[id] = s.spanType;
    };
    for (const entry of transcriptEntries) {
      if (entry.type === "span" || entry.type === "group-span") {
        types[entry.span.spanId] = entry.span.spanType;
      } else if (entry.type === "group") {
        types[entry.firstSpan.spanId] = entry.firstSpan.spanType;
        setType(entry.firstLlmSpanId);
        setType(entry.lastLlmSpanId);
      }
    }
    return types;
  }, [transcriptEntries, spans]);

  const { inputSpanIds, promptHashes } = useMemo(() => {
    const ids: string[] = [];
    const hashes: Record<string, string> = {};
    const spanMap = new Map(spans.map((s) => [s.spanId, s]));

    for (const entry of transcriptEntries) {
      if (entry.type === "group" && entry.firstLlmSpanId) {
        ids.push(entry.firstLlmSpanId);
        const span = spanMap.get(entry.firstLlmSpanId);
        const hash = span?.attributes?.["lmnr.span.prompt_hash"] as string | undefined;
        if (hash) {
          hashes[entry.firstLlmSpanId] = hash;
        }
      }
    }
    return { inputSpanIds: ids, promptHashes: hashes };
  }, [transcriptEntries, spans]);

  // An LLM/CACHED standalone span row needs top spacing whenever it has a
  // preceding row that isn't the user-input row. The user-input row visually
  // pairs with the LLM that follows, so no extra spacing is added there;
  // anything else (another LLM, a tool span, a group) gets separated.
  const needsLlmTopSpacing = useCallback(
    (index: number) => {
      const row = flatRows[index];
      if (!row || row.type !== "span") return false;
      if (row.span.spanType !== "LLM" && row.span.spanType !== "CACHED") return false;
      const prev = flatRows[index - 1];
      return !!prev && prev.type !== "user-input";
    },
    [flatRows]
  );

  const stickyIndexes = useMemo(
    () =>
      flatRows.reduce<number[]>((acc, row, idx) => {
        if (row.type === "group" && transcriptExpandedGroups.has(row.groupId)) acc.push(idx);
        return acc;
      }, []),
    [flatRows, transcriptExpandedGroups]
  );

  const activeStickyIndexRef = useRef<number | null>(null);
  const isActiveSticky = useCallback((index: number) => activeStickyIndexRef.current === index, []);

  const rangeExtractor = useCallback(
    (range: Range) => {
      if (stickyIndexes.length === 0) {
        activeStickyIndexRef.current = null;
        return defaultRangeExtractor(range);
      }
      // The active sticky header is the most recent expanded-group header
      // whose index is at or before the viewport start AND whose group's
      // last child hasn't scrolled out yet. Once we've scrolled past the
      // last row of the group, the header should un-stick.
      let active: number | null = null;
      for (let i = stickyIndexes.length - 1; i >= 0; i--) {
        const headerIdx = stickyIndexes[i];
        if (range.startIndex < headerIdx) continue;
        // Find the index of the last row that belongs to this group
        // (header itself or the trailing group-span/group-input rows).
        let lastIdx = headerIdx;
        for (let j = headerIdx + 1; j < flatRows.length; j++) {
          const r = flatRows[j];
          if (r.type === "group-span" || r.type === "group-input") {
            lastIdx = j;
          } else {
            break;
          }
        }
        if (range.startIndex <= lastIdx) {
          active = headerIdx;
        }
        break;
      }
      activeStickyIndexRef.current = active;
      const next = new Set([...(active !== null ? [active] : []), ...defaultRangeExtractor(range)]);
      return [...next].sort((a, b) => a - b);
    },
    [stickyIndexes, flatRows]
  );

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (needsLlmTopSpacing(index) ? 198 : 182),
    overscan: 20,
    paddingEnd: 64,
    rangeExtractor,
  });

  const items = virtualizer.getVirtualItems();

  const selectedRowIndex = useMemo(() => {
    const selectedId = selectedSpan?.spanId;
    if (!selectedId) return -1;
    // Prefer the actual span row over the group header — when a subagent group is
    // expanded, clicking a span that is also the group's first/last LLM (or the
    // boundary span itself) should scroll to the span row, not the group header.
    const spanRowIndex = flatRows.findIndex(
      (row) => (row.type === "span" || row.type === "group-span") && row.span.spanId === selectedId
    );
    if (spanRowIndex >= 0) return spanRowIndex;
    return flatRows.findIndex(
      (row) =>
        row.type === "group" &&
        (row.firstSpan.spanId === selectedId || row.firstLlmSpanId === selectedId || row.lastLlmSpanId === selectedId)
    );
  }, [flatRows, selectedSpan?.spanId]);

  useEffect(() => {
    if (selectedRowIndex < 0 || isSpansLoading) return;
    virtualizer.scrollToIndex(selectedRowIndex, { align: "auto" });
  }, [selectedRowIndex, virtualizer, isSpansLoading]);

  // Scroll the matching group header into view in response to a click on a
  // subagent block in the condensed timeline.
  useEffect(() => {
    if (!scrollToGroupId || isSpansLoading) return;
    const index = flatRows.findIndex((row) => row.type === "group" && row.groupId === scrollToGroupId);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "start" });
    consumeScrollToGroup();
  }, [scrollToGroupId, flatRows, virtualizer, isSpansLoading, consumeScrollToGroup]);

  const allVisibleSpanIds = useMemo(
    () =>
      items.flatMap((item) => {
        const row = flatRows[item.index];
        return row ? getSpanIdsForRow(row, transcriptExpandedGroups) : [];
      }),
    [items, flatRows, transcriptExpandedGroups]
  );

  const scrollOffset = virtualizer.scrollOffset ?? 0;
  const viewportHeight = virtualizer.scrollRect?.height ?? 0;

  const { visibleStartTime, visibleEndTime } = useMemo(() => {
    const inViewport = filterToViewport(items, scrollOffset, viewportHeight);
    let min = Infinity;
    let max = -Infinity;
    for (const item of inViewport) {
      const row = flatRows[item.index];
      if (!row) continue;
      let startStr: string | undefined;
      let endStr: string | undefined;
      switch (row.type) {
        case "span":
        case "group-span":
          startStr = row.span.startTime;
          endStr = row.span.endTime;
          break;
        case "group":
          startStr = row.startTime;
          endStr = row.endTime;
          break;
        case "group-input": {
          const s = spansById.get(row.firstLlmSpanId);
          if (s) {
            startStr = s.startTime;
            endStr = s.endTime;
          }
          break;
        }
        // user-input: no time mapping
      }
      if (startStr && endStr) {
        const s = new Date(startStr).getTime();
        const e = new Date(endStr).getTime();
        if (s < min) min = s;
        if (e > max) max = e;
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { visibleStartTime: undefined, visibleEndTime: undefined };
    }
    return { visibleStartTime: min, visibleEndTime: max };
  }, [items, flatRows, spansById, scrollOffset, viewportHeight]);

  useReportVisibleTimeRange({ start: visibleStartTime, end: visibleEndTime, setTimeRange: setScrollTimeRange });

  const { previews, inputPreviews, agentNames } = useBatchedSpanPreviews(
    projectId,
    allVisibleSpanIds,
    {
      id: trace?.id,
      startTime: trace?.startTime,
      endTime: trace?.endTime,
    },
    { isShared },
    spanTypes,
    inputSpanIds,
    promptHashes
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
              onToggle={() => {
                track("traces", "subagent_group_toggled", { expanded: isCollapsed });
                toggleTranscriptGroup(row.groupId);
              }}
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
    const spansEmpty = isEmpty(spans);
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center max-w-lg mx-auto">
        <span className="text-base text-secondary-foreground">
          {spansEmpty
            ? "No spans found."
            : "No matching spans found. Transcript mode omits default span types. Switch to tree view to see all spans."}
        </span>
        {!spansEmpty && (
          <Button
            variant="outlinePrimary"
            onClick={() => {
              track("traces", "view_switched", { from: "transcript", to: "tree" });
              setTab("tree");
            }}
          >
            <ListTree size={14} className="mr-1" />
            Switch to tree
          </Button>
        )}
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
        {items.map((virtualRow) => {
          const row = flatRows[virtualRow.index];
          if (!row) return null;
          const nextRow = flatRows[virtualRow.index + 1];
          const isGroupChild = row.type === "group-span" || row.type === "group-input";
          const isCollapsedGroup = row.type === "group" && (!nextRow || !isGroupChildType(nextRow.type));
          const isLastGroupChild = isGroupChild && (!nextRow || !isGroupChildType(nextRow.type));
          const needsSpacing = needsLlmTopSpacing(virtualRow.index);
          const activeSticky = isActiveSticky(virtualRow.index);

          const positionStyle: CSSProperties = activeSticky
            ? { position: "sticky", top: 0, background: "hsl(var(--background))" }
            : { position: "absolute", top: 0, transform: `translateY(${virtualRow.start}px)` };

          if (row.type === "group") {
            positionStyle.zIndex = activeSticky ? 10 : 1;
          }

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{ ...positionStyle, left: 0, width: "100%" }}
              className={cn({
                "pt-1": row.type === "group",
                "pt-4": needsSpacing,
                "pb-1": isCollapsedGroup || isLastGroupChild,
              })}
            >
              {renderRow(row)}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Transcript;
