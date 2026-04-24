import React, { memo } from "react";
import { shallow } from "zustand/shallow";

import { cn } from "@/lib/utils";

import { type SessionViewSelectedSpan, useSessionViewStore } from "../store";
import SessionTimelineSpanBarElement from "./session-timeline-span-bar";
import { ROW_HEIGHT } from "./session-timeline-trace-bar";
import { type SessionTimelineSpanContainer } from "./utils";

interface SessionTimelineSpanContainerElementProps {
  container: SessionTimelineSpanContainer;
  selectedSpan?: SessionViewSelectedSpan;
  onClick: (traceId: string) => void;
  onSpanClick: (traceId: string, spanId: string) => void;
}

/**
 * Bordered container that REPLACES the trace bar when a trace is expanded.
 * Spans are rendered inside using trace-relative percentages. The container's
 * outer box uses `box-sizing: content-box` so the 1px border sits OUTSIDE
 * the declared height — which means the span rows fit exactly inside.
 *
 * Click on empty container area = collapse the trace (onClick). Clicks on
 * spans are intercepted by the span bar (stopPropagation) and route to
 * onSpanClick.
 */
const SessionTimelineSpanContainerElement = ({
  container,
  selectedSpan,
  onClick,
  onSpanClick,
}: SessionTimelineSpanContainerElementProps) => {
  const { transcriptExpandedGroups, toggleTranscriptGroup } = useSessionViewStore(
    (s) => ({
      transcriptExpandedGroups: s.transcriptExpandedGroups,
      toggleTranscriptGroup: s.toggleTranscriptGroup,
    }),
    shallow
  );

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(container.traceId);
  };

  return (
    <div
      className="absolute rounded-xs border border-muted-foreground/30 bg-muted/50 cursor-pointer"
      style={{
        boxSizing: "content-box",
        left: `${container.left}%`,
        width: `max(${container.width}%, 4px)`,
        top: container.row * ROW_HEIGHT + 1,
        // Interior height = rowHeight rows. Border adds 2px outside (content-box).
        height: container.rowHeight * ROW_HEIGHT - 2,
      }}
      onClick={handleClick}
    >
      {container.spans.map((bar) => (
        <SessionTimelineSpanBarElement
          key={bar.span.spanId}
          bar={bar}
          traceId={container.traceId}
          selectedSpan={selectedSpan}
          onClick={onSpanClick}
        />
      ))}

      {/* Subagent group wrappers — collapsed = solid cyan over the group's
          spans; expanded = cyan outline, pointer-events-none so span bars
          underneath stay interactive. Sync'd with the transcript via the
          session store's namespaced transcriptExpandedGroups. */}
      {container.groupBoxes.map((box) => {
        const collapsed = !transcriptExpandedGroups.has(`${container.traceId}::${box.groupId}`);
        return (
          <div
            key={box.groupId}
            className={cn(
              "absolute rounded-xs border border-subagent/70",
              collapsed ? "bg-subagent/70 cursor-pointer hover:brightness-110 z-10" : "pointer-events-none"
            )}
            style={{
              left: `${box.left}%`,
              width: `max(${box.width}%, 4px)`,
              top: box.topRow * ROW_HEIGHT + 1,
              height: box.rowSpan * ROW_HEIGHT - 2,
            }}
            onClick={
              collapsed
                ? (e) => {
                    e.stopPropagation();
                    toggleTranscriptGroup(container.traceId, box.groupId);
                  }
                : undefined
            }
          />
        );
      })}
    </div>
  );
};

export default memo(SessionTimelineSpanContainerElement);
