import { Box, Boxes, CircleDashed } from "lucide-react";

import { type IconVariant } from "@/components/signal/clusters-section/cluster-list/cluster-icon";
import { withOpacity } from "@/lib/clusters/colors";
import { cn } from "@/lib/utils";

// Landing copy of components/signal/clusters-section/cluster-list/cluster-icon.
//
// At rest it renders exactly what production renders. The reason it exists is
// `pulsing`: when the signal-event pill lands in a row, that row's icon flashes
// to full opacity. Production's `boxes` glyph is pinned at 10% fill / 70%
// stroke with no brighter state to borrow (only `box` has one, via isSelected),
// so the landing needs its own opacity pair.
//
// Colours go through `style` rather than the `fill`/`stroke` props: those land
// as SVG attributes, which CSS transitions cannot animate. Inline style beats
// the attribute and children inherit it, so the flash tweens.
const REST = { fill: 0.1, stroke: 0.7 };
const LIT = { fill: 0.45, stroke: 1 };

// Fast in, slow out — a flash, not a fade in both directions.
const TIMING = (pulsing: boolean) => (pulsing ? "duration-100" : "duration-300");

export default function ClusterIcon({
  iconVariant,
  color,
  isSelected,
  pulsing,
}: {
  iconVariant: IconVariant;
  color: string;
  isSelected?: boolean;
  pulsing?: boolean;
}) {
  const level = pulsing ? LIT : REST;
  const paint = {
    fill: withOpacity(color, level.fill),
    stroke: withOpacity(color, level.stroke),
    transitionProperty: "fill, stroke",
  };
  const cls = cn("shrink-0 ease-out", TIMING(!!pulsing));

  return (
    <div className="size-4 flex justify-center items-center">
      {iconVariant === "boxes" ? (
        <Boxes className={cn(cls, "size-4.5")} style={paint} strokeWidth={1} />
      ) : iconVariant === "circle-dashed" ? (
        <CircleDashed className={cn(cls, "size-3.5")} style={{ ...paint, fill: "none", stroke: color }} />
      ) : (
        <Box
          className={cn(cls, "size-3.5")}
          style={isSelected && !pulsing ? { ...paint, fill: withOpacity(color, 0.5), stroke: color } : paint}
          strokeWidth={1.5}
        />
      )}
    </div>
  );
}
