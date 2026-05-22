import { cn } from "@/lib/utils";

import { type IconVariant } from "./cells";
import { TILE_SHELL, VARIANT_BG, VARIANT_ICON } from "./tile-styles";

const ROWS = 24;
const COLS = 24;

// Tessellated diamond field for the hero visual (Figma 4173:30043).
// Cells are plain 24×24 squares; the parent transform — rotate(120deg)
// then skewX(-30deg) then scaleY(0.87) — is what turns the grid into the
// isometric/dimetric diamond look. The wrapper crops via overflow-hidden
// at the caller; this component just paints the full 668×668 pre-transform
// grid and lets the caller place/clip it.
//
// Icon tiles live INSIDE the same transformed wrapper — the SVG glyph
// inherits the rotate+skew+scale and reads as a sticker painted on a
// tilted floor tile. No counter-rotation (intentional).

interface Props {
  className?: string;
  /** Set of "row-col" keys for cells that should be left transparent
   *  ("punched out"). Used to mark grid slots where an ExtendedDiamond
   *  overlay sits at rest; when the overlay extends, the hole reveals. */
  emptyCells?: ReadonlySet<string>;
  /** Map of "row-col" → variant for cells that should render as colored
   *  icon tiles instead of the default landing-surface-400. Extended
   *  cells in this map are looked up by the overlay instead (the grid
   *  slot stays empty here). */
  iconCells?: ReadonlyMap<string, IconVariant>;
}

const DiamondGrid = ({ className, emptyCells, iconCells }: Props) => (
  <div className={cn("flex items-center justify-center", className)}>
    <div style={{ transform: "rotate(120deg) skewX(-30deg) scaleY(0.87)" }}>
      <div className="flex flex-col gap-1">
        {Array.from({ length: ROWS }).map((_, r) => (
          <div key={r} className="flex gap-1">
            {Array.from({ length: COLS }).map((_, c) => {
              const key = `${r}-${c}`;
              if (emptyCells?.has(key)) {
                return <div key={c} className="size-6 shrink-0" />;
              }
              const variant = iconCells?.get(key);
              if (variant) {
                return (
                  <div key={c} className={cn("size-6 shrink-0 opacity-50", TILE_SHELL, VARIANT_BG[variant])}>
                    {VARIANT_ICON[variant]}
                  </div>
                );
              }
              return <div key={c} className="size-6 shrink-0 bg-landing-surface-400" />;
            })}
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default DiamondGrid;
