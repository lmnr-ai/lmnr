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
  onToggle: (groupId: string) => void;
}

function SubagentGroupElement({
  groupId,
  left,
  width,
  topRow,
  rowSpan,
  collapsed,
  onToggle,
}: SubagentGroupElementProps) {
  const top = topRow * ROW_HEIGHT + 1;
  const height = rowSpan * ROW_HEIGHT - 2;

  return (
    <div
      className={cn(
        "absolute rounded-xs border",
        collapsed
          ? "bg-subagent/40 cursor-pointer hover:bg-subagent/50 z-10 border-subagent"
          : "pointer-events-none outline outline-offset-1 outline-subagent/40 bg-subagent/10 border-none"
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
        onToggle(groupId);
      }}
    />
  );
}

export default memo(SubagentGroupElement);
