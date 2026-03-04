"use client";

import CondensedBlockComponent from "./condensed-block";
import { type BlockSummary, type CondensedBlock, ROW_HEIGHT } from "./timeline-types";

interface TimelineSwimlaneProps {
  label: string;
  blocks: CondensedBlock[];
  summaries: Record<string, BlockSummary>;
  sharedDurationMs: number;
  traceStartMs: number;
  timelineWidthPx: number;
  onBlockClick: (spanId: string) => void;
}

const TimelineSwimlane = ({
  label,
  blocks,
  summaries,
  sharedDurationMs,
  traceStartMs,
  timelineWidthPx,
  onBlockClick,
}: TimelineSwimlaneProps) => {
  const maxRow = blocks.reduce((max, b) => Math.max(max, b.row), 0);
  const innerHeight = (maxRow + 1) * ROW_HEIGHT + 4;

  return (
    <div className="flex flex-col overflow-y-auto flex-1 min-h-0">
      <div className="sticky left-0 px-2 py-1 text-xs text-muted-foreground font-medium z-10 bg-background">
        {label}
      </div>
      <div className="relative flex-1" style={{ height: innerHeight, minWidth: timelineWidthPx }}>
        {blocks.map((block) => (
          <CondensedBlockComponent
            key={block.parentSpanId}
            block={block}
            summary={summaries[block.parentSpanId]}
            sharedDurationMs={sharedDurationMs}
            traceStartMs={traceStartMs}
            timelineWidthPx={timelineWidthPx}
            onClick={() => onBlockClick(block.parentSpanId)}
          />
        ))}
      </div>
    </div>
  );
};

export default TimelineSwimlane;
