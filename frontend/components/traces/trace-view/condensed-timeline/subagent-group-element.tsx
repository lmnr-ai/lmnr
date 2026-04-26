import React, { memo } from "react";

import { cn } from "@/lib/utils";

import { ROW_HEIGHT } from "./condensed-timeline-element";

interface SubagentGroupElementProps {
  groupId: string;
  left: number;
  width: number;
  topRow: number;
  rowSpan: number;
  collapsed: boolean;
  onRequestScroll: (groupId: string) => void;
}

function SubagentGroupElement({
  groupId,
  left,
  width,
  topRow,
  rowSpan,
  collapsed,
  onRequestScroll,
}: SubagentGroupElementProps) {
  const top = topRow * ROW_HEIGHT + 1;
  const height = rowSpan * ROW_HEIGHT - 2;

  return (
    <div
      className={cn(
        "absolute rounded-xs border",
        collapsed
          ? "bg-subagent/30 cursor-pointer hover:bg-subagent/40 z-10 border-subagent"
          : "pointer-events-none outline outline-offset-1 outline-subagent/30 bg-subagent/10 border-none"
      )}
      style={{
        left: `${left}%`,
        width: `max(${width}%, 4px)`,
        top,
        height,
      }}
      onClick={(e) => {
        if (!collapsed) return;
        e.stopPropagation();
        onRequestScroll(groupId);
      }}
    />
  );
}

export default memo(SubagentGroupElement);
