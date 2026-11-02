import { type DashboardChart, GRID_COLS } from "@/components/dashboards/types";
import { cn } from "@/lib/utils";

import ChartGlyph from "./chart-glyph";

export const THUMBNAIL_WIDTH = 140;
export const THUMBNAIL_HEIGHT = 84;
// Inset from the thumbnail edges, and space between blocks.
const PADDING = 6;
const GAP = 2;
// Pitch includes one gap per cell, so a full-width block ends exactly at the right padding.
const COL = (THUMBNAIL_WIDTH - PADDING * 2 + GAP) / GRID_COLS;
// The real grid is ~100px per column and 48px per row (36 + 12 margin), so a row is ~half a column.
const ROW = COL * 0.4;

/** The top of a dashboard's grid at thumbnail scale: one block per chart, no data. */
const LayoutThumbnail = ({ charts, className }: { charts?: DashboardChart[]; className?: string }) => (
  <div
    className={cn("relative overflow-hidden rounded-md", className)}
    style={{ width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT }}
  >
    {/* Clipped, not scrollable; the fade only marks that the layout continues below. */}
    <div className="scroll-fade-b absolute inset-0 overflow-hidden">
      {charts?.map(({ id, settings: { config, layout } }) => {
        const width = layout.w * COL - GAP;
        const height = layout.h * ROW - GAP;
        return (
          <div
            key={id}
            className="absolute rounded-sm bg-emphasis-1"
            style={{ left: PADDING + layout.x * COL, top: PADDING + layout.y * ROW, width, height }}
          >
            <ChartGlyph type={config.type} seed={id} width={width} height={height} />
          </div>
        );
      })}
    </div>
  </div>
);

export default LayoutThumbnail;
