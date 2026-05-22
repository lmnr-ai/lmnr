import { cn } from "@/lib/utils";

const ROWS = 24;
const COLS = 24;

// Tessellated diamond field for the hero visual (Figma 4173:30043).
// Cells are plain 24×24 squares; the parent transform — rotate(120deg)
// then skewX(-30deg) then scaleY(0.87) — is what turns the grid into the
// isometric/dimetric diamond look. The wrapper crops via overflow-hidden
// at the caller; this component just paints the full 668×668 pre-transform
// grid and lets the caller place/clip it.
interface Props {
  className?: string;
  /** Set of "row-col" keys for cells that should be left transparent
   *  ("punched out"). Used to mark grid slots where an ExtendedDiamond
   *  overlay sits at rest; when the overlay extends, the hole reveals. */
  emptyCells?: ReadonlySet<string>;
}

const DiamondGrid = ({ className, emptyCells }: Props) => (
  <div className={cn("flex items-center justify-center", className)}>
    <div style={{ transform: "rotate(120deg) skewX(-30deg) scaleY(0.87)" }}>
      <div className="flex flex-col gap-1">
        {Array.from({ length: ROWS }).map((_, r) => (
          <div key={r} className="flex gap-1">
            {Array.from({ length: COLS }).map((_, c) => (
              <div
                key={c}
                className={cn("size-6 shrink-0", !emptyCells?.has(`${r}-${c}`) && "bg-landing-surface-400")}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default DiamondGrid;
