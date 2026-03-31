"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { type SessionRow as SessionRowType, type TraceRow, type TraceTimelineItem } from "@/lib/traces/types";

import SessionRowComponent from "./session-row";
import SessionTableHeader from "./session-table-header";
import SessionTraceCard from "./session-trace-card";
import TraceSectionHeader from "./trace-section-header";

type VirtualListItem =
  | { type: "session-row"; session: SessionRowType; timeline?: TraceTimelineItem[] }
  | { type: "trace-section-header"; sessionId: string }
  | { type: "trace-card"; trace: TraceRow; sessionId: string; isFirst: boolean; isLast: boolean };

interface SessionsVirtualListProps {
  sessions: SessionRowType[];
  expandedSessions: Set<string>;
  sessionTraces: Record<string, TraceRow[]>;
  sessionTimelines: Record<string, TraceTimelineItem[]>;
  onToggleSession: (sessionId: string) => void;
  onTraceClick: (trace: TraceRow) => void;
  hasMore: boolean;
  isFetching: boolean;
  isLoading: boolean;
  fetchNextPage: () => void;
}

function estimateSize(item: VirtualListItem): number {
  if (item.type === "session-row") return 36;
  if (item.type === "trace-section-header") return 52;
  // trace-card: 173px card + padding (8px top for first, 24px bottom for last, 8px otherwise)
  if (item.type === "trace-card") {
    const topPad = item.isFirst ? 8 : 0;
    const bottomPad = item.isLast ? 24 : 8;
    return 173 + topPad + bottomPad;
  }
  return 36;
}

export default function SessionsVirtualList({
  sessions,
  expandedSessions,
  sessionTraces,
  sessionTimelines,
  onToggleSession,
  onTraceClick,
  hasMore,
  isFetching,
  isLoading,
  fetchNextPage,
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
        const traces = sessionTraces[session.sessionId] ?? [];
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
    return items;
  }, [sessions, expandedSessions, sessionTraces, sessionTimelines]);

  const virtualizer = useVirtualizer({
    count: flatList.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => estimateSize(flatList[index]),
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
            />
          );
        case "trace-section-header":
          return <TraceSectionHeader />;
        case "trace-card":
          return (
            <SessionTraceCard
              trace={item.trace}
              isFirst={item.isFirst}
              isLast={item.isLast}
              onClick={() => onTraceClick(item.trace)}
            />
          );
      }
    },
    [expandedSessions, onToggleSession, onTraceClick]
  );

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-auto styled-scrollbar">
      <SessionTableHeader />
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
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
      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} style={{ height: 1 }} />
    </div>
  );
}
