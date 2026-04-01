"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { type SessionRow as SessionRowType, type TraceRow, type TraceTimelineItem } from "@/lib/traces/types";

const itemTransition = { type: "spring", stiffness: 400, damping: 50 } as const;

import SessionRowComponent from "./session-row";
import SessionTableHeader from "./session-table-header";
import SessionTraceCard from "./session-trace-card";
import TraceSectionHeader from "./trace-section-header";

type VirtualListItem =
  | { type: "session-row"; session: SessionRowType; timeline?: TraceTimelineItem[] }
  | { type: "trace-section-header"; sessionId: string }
  | { type: "trace-card"; trace: TraceRow; sessionId: string; isFirst: boolean; isLast: boolean }
  | { type: "trace-loading"; sessionId: string }
  | { type: "trace-empty"; sessionId: string };

interface SessionsVirtualListProps {
  sessions: SessionRowType[];
  expandedSessions: Set<string>;
  loadingSessions: Set<string>;
  sessionTraces: Record<string, TraceRow[]>;
  sessionTimelines: Record<string, TraceTimelineItem[]>;
  onToggleSession: (sessionId: string) => void;
  onTraceClick: (traceId: string) => void;
  hasMore: boolean;
  isFetching: boolean;
  isLoading: boolean;
  fetchNextPage: () => void;
  error?: Error | null;
  onRetry?: () => void;
}

function estimateSize(item: VirtualListItem): number {
  if (item.type === "session-row") return 36;
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
  sessionTimelines,
  onToggleSession,
  onTraceClick,
  hasMore,
  isFetching,
  isLoading,
  fetchNextPage,
  error,
  onRetry,
}: SessionsVirtualListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const flatList = useMemo(() => {
    const items: VirtualListItem[] = [];
    for (const session of sessions) {
      items.push({
        type: "session-row",
        session,
        timeline: sessionTimelines[session.sessionId],
      });
      if (expandedSessions.has(session.sessionId)) {
        const isLoading = loadingSessions.has(session.sessionId);
        const traces = (sessionTraces[session.sessionId] ?? [])
          .slice()
          .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

        if (isLoading) {
          items.push({ type: "trace-loading", sessionId: session.sessionId });
        } else if (traces.length === 0) {
          items.push({ type: "trace-empty", sessionId: session.sessionId });
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
  }, [sessions, expandedSessions, loadingSessions, sessionTraces, sessionTimelines]);

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

  const virtualizer = useVirtualizer({
    count: flatList.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => estimateSize(flatList[index]),
    getItemKey,
    overscan: 20,
  });

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
              timeline={item.timeline}
              isExpanded={expandedSessions.has(item.session.sessionId)}
              onToggle={() => onToggleSession(item.session.sessionId)}
              onTraceClick={onTraceClick}
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
        case "trace-card":
          return (
            <motion.div
              initial={{ height: 120, opacity: 0.5 }}
              animate={{ height: "auto", opacity: 1 }}
              transition={itemTransition}
              style={{ overflow: "hidden" }}
            >
              <SessionTraceCard
                trace={item.trace}
                isFirst={item.isFirst}
                isLast={item.isLast}
                onClick={() => onTraceClick(item.trace.id)}
              />
            </motion.div>
          );
        case "trace-loading":
          return (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: "hidden" }}
            >
              <div className="flex items-center justify-center h-[60px] pl-6">
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
              <div className="flex items-center justify-center h-[60px] pl-6">
                <span className="text-xs text-muted-foreground">No traces in this session</span>
              </div>
            </motion.div>
          );
      }
    },
    [expandedSessions, onToggleSession, onTraceClick]
  );

  const showList = !isLoading && sessions.length > 0;

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-auto styled-scrollbar rounded-lg">
      <SessionTableHeader />
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
              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
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
  );
}
