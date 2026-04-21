"use client";

import { defaultRangeExtractor, type Range, useVirtualizer } from "@tanstack/react-virtual";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { type SessionRow as SessionRowType, type TraceRow } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import SessionRowComponent from "./session-row";
import SessionTableHeader, { type SessionSortColumn, type SortDirection } from "./session-table-header";
import SessionTraceCard from "./session-trace-card";
import TraceSectionHeader from "./trace-section-header";
import { type TraceIOEntry, useBatchedTraceIO } from "./use-batched-trace-io";

const SESSION_HEADER_HEIGHT = 36;

const itemTransition = { type: "spring", stiffness: 400, damping: 50 } as const;

type VirtualListItem =
  | { type: "session-row"; session: SessionRowType; isLast: boolean }
  | { type: "trace-section-header"; sessionId: string }
  | { type: "trace-card"; trace: TraceRow; sessionId: string; isFirst: boolean; isLast: boolean }
  | { type: "trace-loading"; sessionId: string; isLast: boolean }
  | { type: "trace-empty"; sessionId: string; isLast: boolean };

interface SessionsVirtualListProps {
  sessions: SessionRowType[];
  expandedSessions: Set<string>;
  loadingSessions: Set<string>;
  sessionTraces: Record<string, TraceRow[]>;
  onToggleSession: (sessionId: string) => void;
  onTraceClick: (traceId: string) => void;
  onOpenSession: (sessionId: string) => void;
  hasMore: boolean;
  isFetching: boolean;
  isLoading: boolean;
  fetchNextPage: () => void;
  error?: Error | null;
  onRetry?: () => void;
  sortColumn?: SessionSortColumn;
  sortDirection?: SortDirection;
  onSort: (column: SessionSortColumn, direction: SortDirection) => void;
  onClearSort: () => void;
}

function estimateSize(item: VirtualListItem): number {
  if (item.type === "session-row") return 42;
  if (item.type === "trace-section-header") return 52;
  if (item.type === "trace-loading" || item.type === "trace-empty") return 60;
  // trace-card: 140px card + padding (8px top for first, 24px bottom for last, 8px otherwise)
  if (item.type === "trace-card") {
    const topPad = item.isFirst ? 8 : 0;
    const bottomPad = item.isLast ? 24 : 8;
    return 140 + topPad + bottomPad;
  }
  return 36;
}

export default function SessionsVirtualList({
  sessions,
  expandedSessions,
  loadingSessions,
  sessionTraces,
  onToggleSession,
  onTraceClick,
  onOpenSession,
  hasMore,
  isFetching,
  isLoading,
  fetchNextPage,
  error,
  onRetry,
  sortColumn,
  sortDirection,
  onSort,
  onClearSort,
}: SessionsVirtualListProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const flatList = useMemo(() => {
    const items: VirtualListItem[] = [];
    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      const isLastSession = i === sessions.length - 1;
      const isExpanded = expandedSessions.has(session.sessionId);

      items.push({
        type: "session-row",
        session,
        isLast: isLastSession && !isExpanded,
      });

      if (isExpanded) {
        const isLoading = loadingSessions.has(session.sessionId);
        const traces = sessionTraces[session.sessionId] ?? [];

        if (isLoading) {
          items.push({ type: "trace-loading", sessionId: session.sessionId, isLast: isLastSession });
        } else if (traces.length === 0) {
          items.push({ type: "trace-empty", sessionId: session.sessionId, isLast: isLastSession });
        } else {
          items.push({ type: "trace-section-header", sessionId: session.sessionId });
          traces.forEach((trace, idx) => {
            items.push({
              type: "trace-card",
              trace,
              sessionId: session.sessionId,
              isFirst: idx === 0,
              isLast: idx === traces.length - 1,
            });
          });
        }
      }
    }
    return items;
  }, [sessions, expandedSessions, loadingSessions, sessionTraces]);

  const getItemKey = useCallback(
    (index: number) => {
      const item = flatList[index];
      switch (item.type) {
        case "session-row":
          return `session-${item.session.sessionId}`;
        case "trace-section-header":
          return `header-${item.sessionId}`;
        case "trace-card":
          return `card-${item.trace.id}`;
        case "trace-loading":
          return `loading-${item.sessionId}`;
        case "trace-empty":
          return `empty-${item.sessionId}`;
      }
    },
    [flatList]
  );

  const stickyIndexes = useMemo(
    () =>
      flatList.reduce<number[]>((acc, item, index) => {
        if (item.type === "session-row" && expandedSessions.has(item.session.sessionId)) {
          acc.push(index);
        }
        return acc;
      }, []),
    [flatList, expandedSessions]
  );

  const activeStickyIndexRef = useRef<number | null>(null);

  const isActiveSticky = useCallback((index: number) => activeStickyIndexRef.current === index, []);

  const rangeExtractor = useCallback(
    (range: Range) => {
      if (stickyIndexes.length === 0) return defaultRangeExtractor(range);

      activeStickyIndexRef.current = [...stickyIndexes].reverse().find((index) => range.startIndex >= index) ?? null;

      const next = new Set([
        ...(activeStickyIndexRef.current !== null ? [activeStickyIndexRef.current] : []),
        ...defaultRangeExtractor(range),
      ]);

      return [...next].sort((a, b) => a - b);
    },
    [stickyIndexes]
  );

  const virtualizer = useVirtualizer({
    count: flatList.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => estimateSize(flatList[index]),
    getItemKey,
    overscan: 20,
    rangeExtractor,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const rangeStart = virtualItems[0]?.index ?? 0;
  const rangeEnd = virtualItems[virtualItems.length - 1]?.index ?? 0;

  const visibleTraceIds = useMemo(() => {
    const ids: string[] = [];
    for (let i = rangeStart; i <= rangeEnd; i++) {
      const item = flatList[i];
      if (item?.type === "trace-card" && item.trace.totalTokens > 0) {
        ids.push(item.trace.id);
      }
    }
    return ids;
  }, [rangeStart, rangeEnd, flatList]);

  const { previews: traceIOPreviews } = useBatchedTraceIO(projectId, visibleTraceIds);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const scrollContainer = scrollContainerRef.current;
    if (!sentinel || !scrollContainer) return;
    if (!hasMore || isFetching || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isFetching) {
          fetchNextPage();
        }
      },
      { root: scrollContainer, rootMargin: "420px", threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasMore, isFetching, isLoading]);

  const renderItem = useCallback(
    (item: VirtualListItem) => {
      switch (item.type) {
        case "session-row":
          return (
            <SessionRowComponent
              session={item.session}
              isExpanded={expandedSessions.has(item.session.sessionId)}
              isLast={item.isLast}
              onToggle={() => onToggleSession(item.session.sessionId)}
              onOpen={() => onOpenSession(item.session.sessionId)}
            />
          );
        case "trace-section-header":
          return (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              transition={itemTransition}
              style={{ overflow: "hidden" }}
            >
              <TraceSectionHeader />
            </motion.div>
          );
        case "trace-card": {
          const io: TraceIOEntry | null | undefined = traceIOPreviews[item.trace.id];
          const ioLoading = item.trace.totalTokens > 0 && io === undefined;
          return (
            <motion.div
              initial={{ height: 120, opacity: 0.5 }}
              animate={{ height: "auto", opacity: 1 }}
              transition={itemTransition}
              style={{ overflow: "hidden" }}
            >
              <SessionTraceCard
                trace={item.trace}
                isLast={item.isLast}
                onClick={() => onTraceClick(item.trace.id)}
                traceIO={io ?? undefined}
                isIOLoading={ioLoading}
              />
            </motion.div>
          );
        }
        case "trace-loading":
          return (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: "hidden" }}
            >
              <div className={cn("flex items-center justify-center h-[60px] pl-6", !item.isLast && "border-b")}>
                <Loader2 className="animate-spin w-4 h-4 text-muted-foreground" />
                <span className="ml-2 text-xs text-muted-foreground">Loading traces...</span>
              </div>
            </motion.div>
          );
        case "trace-empty":
          return (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              transition={itemTransition}
              style={{ overflow: "hidden" }}
            >
              <div className={cn("flex items-center justify-center h-[60px] pl-6", !item.isLast && "border-b")}>
                <span className="text-xs text-muted-foreground">No traces in this session</span>
              </div>
            </motion.div>
          );
      }
    },
    [expandedSessions, onToggleSession, onTraceClick, onOpenSession, traceIOPreviews]
  );

  const showList = !isLoading && sessions.length > 0;

  return (
    <div ref={scrollContainerRef} className="overflow-auto styled-scrollbar rounded-md border min-h-0">
      <div className="w-fit min-w-full">
        <SessionTableHeader
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={onSort}
          onClearSort={onClearSort}
        />
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin w-5 h-5 text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading sessions...</span>
          </div>
        )}
        {!isLoading && error && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <span className="text-sm text-destructive">Failed to load sessions</span>
            <span className="text-xs text-muted-foreground">{error.message}</span>
            {onRetry && (
              <button onClick={onRetry} className="text-xs text-primary underline hover:no-underline mt-1">
                Retry
              </button>
            )}
          </div>
        )}
        {!isLoading && !error && sessions.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <span className="text-sm text-muted-foreground">No sessions found</span>
          </div>
        )}
        {showList && (
          <>
            <div style={{ height: virtualizer.getTotalSize() }} className="relative">
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const item = flatList[virtualItem.index];
                const activeSticky = isActiveSticky(virtualItem.index);
                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    style={{
                      ...(activeSticky
                        ? { position: "sticky", top: SESSION_HEADER_HEIGHT, zIndex: 1 }
                        : { position: "absolute", top: 0, transform: `translateY(${virtualItem.start}px)` }),
                      left: 0,
                      width: "100%",
                    }}
                  >
                    {renderItem(item)}
                  </div>
                );
              })}
            </div>
            <div ref={sentinelRef} style={{ height: 1 }} />
            {isFetching && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="animate-spin w-4 h-4 text-muted-foreground" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
