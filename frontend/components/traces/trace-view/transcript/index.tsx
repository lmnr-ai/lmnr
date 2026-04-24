import { useVirtualizer } from "@tanstack/react-virtual";
import { isEmpty, times } from "lodash";
import { ListTree } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
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
import { useReportVisibleTimeRange } from "@/components/traces/trace-view/use-report-visible-time-range";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { track } from "@/lib/posthog";
import { cn } from "@/lib/utils.ts";

interface ListProps {
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
    setTab,
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

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 186,
    overscan: 20,
    paddingEnd: 64,
  });

  const items = virtualizer.getVirtualItems();

  const selectedRowIndex = useMemo(() => {
    const selectedId = selectedSpan?.spanId;
    if (!selectedId) return -1;
    return flatRows.findIndex((row) => {
      switch (row.type) {
        case "span":
        case "group-span":
          return row.span.spanId === selectedId;
        case "group":
          return (
            row.firstSpan.spanId === selectedId || row.firstLlmSpanId === selectedId || row.lastLlmSpanId === selectedId
          );
        default:
          return false;
      }
    });
  }, [flatRows, selectedSpan?.spanId]);

  useEffect(() => {
    if (selectedRowIndex < 0 || isSpansLoading) return;
    virtualizer.scrollToIndex(selectedRowIndex, { align: "auto" });
  }, [selectedRowIndex, virtualizer, isSpansLoading]);

  const allVisibleSpanIds = useMemo(
    () =>
      items.flatMap((item) => {
        const row = flatRows[item.index];
        return row ? getSpanIdsForRow(row, transcriptExpandedGroups) : [];
      }),
    [items, flatRows, transcriptExpandedGroups]
  );

  const { visibleStartTime, visibleEndTime } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const item of items) {
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
  }, [items, flatRows, spansById]);

  useReportVisibleTimeRange({ start: visibleStartTime, end: visibleEndTime });

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
            const nextRow = flatRows[virtualRow.index + 1];
            const isGroupChild = row.type === "group-span" || row.type === "group-input";
            const isCollapsedGroup = row.type === "group" && (!nextRow || !isGroupChildType(nextRow.type));
            const isLastGroupChild = isGroupChild && (!nextRow || !isGroupChildType(nextRow.type));
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className={cn({
                  "pt-1": row.type === "group",
                  "pb-1": isCollapsedGroup || isLastGroupChild,
                })}
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
