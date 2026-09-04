import { Box, Boxes, CircleDashed } from "lucide-react";

import { withOpacity } from "@/lib/clusters/colors";
import { cn } from "@/lib/utils";

export type IconVariant = "boxes" | "box" | "circle-dashed";

export default function ClusterIcon({
  iconVariant,
  color,
  isSelected,
  isPaywall,
  iconClassName,
  size,
}: {
  iconVariant: IconVariant;
  color: string;
  isSelected?: boolean;
  isPaywall?: boolean;
  /** Overrides the glyph's own size. The three variants are sized differently
   * on purpose, so this merges over whichever one is drawn rather than setting
   * one size for all of them. */
  iconClassName?: string;
  /** Box AND glyph, in px, overriding both. A list row has 16px to spare; the
   *  icicle's bands do not, so it dials this down. Uniform across the variants
   *  on purpose — at these sizes their 14/18px split reads as a mistake. */
  size?: number;
}) {
  const sized = size !== undefined;
  return (
    <div
      className={cn("flex justify-center items-center", !sized && "size-4", { "blur-[5px]": isPaywall })}
      style={sized ? { width: size, height: size } : undefined}
    >
      {iconVariant === "boxes" ? (
        <Boxes
          size={size}
          className={cn("shrink-0", !sized && "size-4.5", iconClassName)}
          fill={withOpacity(color, 0.1)}
          stroke={withOpacity(color, 0.7)}
          strokeWidth={1}
        />
      ) : iconVariant === "circle-dashed" ? (
        <CircleDashed size={size} className={cn("shrink-0", !sized && "size-3.5", iconClassName)} stroke={color} />
      ) : (
        <Box
          fill={isSelected ? withOpacity(color, 0.5) : withOpacity(color, 0.1)}
          stroke={isSelected ? color : withOpacity(color, 0.7)}
          size={size}
          className={cn("shrink-0", !sized && "size-3.5", iconClassName)}
          strokeWidth={1.5}
        />
      )}
    </div>
  );
}
