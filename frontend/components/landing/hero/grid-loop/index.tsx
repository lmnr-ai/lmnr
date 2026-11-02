"use client";

import { useRef } from "react";

import { cn } from "@/lib/utils";

import { LANDING_COLUMN_MAX_W } from "../../class-names";
import Diagram from "./diagram";
import DotGrid from "./dot-grid";
import { CELL, getGridLoopLayout } from "./geometry";
import { SETTLED_TIME } from "./timeline";
import { useGridColumns } from "./use-grid-columns";
import { usePlaybackTime } from "./use-playback-time";

// Left inset of the scrolled diagram on narrow screens; a multiple of CELL keeps it on the dots.
const SCROLL_GUTTER = CELL;

const GridLoop = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const { cols, compact } = useGridColumns(sectionRef);
  const time = usePlaybackTime(sectionRef, SETTLED_TIME);
  const layout = getGridLoopLayout(cols, compact);
  // One empty row of dots above and below the diagram.
  const gridRows = layout.height / CELL + 2;

  return (
    <section
      ref={sectionRef}
      className={cn("relative mx-auto w-full", LANDING_COLUMN_MAX_W)}
      style={{ height: gridRows * CELL }}
      aria-label="Agent development and production loop"
    >
      {compact ? (
        // Narrower than the diagram: a full-bleed strip the user can swipe across.
        <div className="no-scrollbar absolute top-0 left-1/2 h-full w-screen -translate-x-1/2 overflow-x-auto overflow-y-hidden">
          <div className="relative h-full min-w-full" style={{ width: layout.width + SCROLL_GUTTER * 2 }}>
            <DotGrid rows={gridRows} overhang={false} />
            <Diagram layout={layout} left={SCROLL_GUTTER} time={time} />
          </div>
        </div>
      ) : (
        <>
          <DotGrid rows={gridRows} />
          <Diagram layout={layout} left={0} time={time} />
        </>
      )}
    </section>
  );
};

export default GridLoop;
