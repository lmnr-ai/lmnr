import { Box, Boxes, CircleDashed } from "lucide-react";

import { withOpacity } from "@/lib/clusters/colors";
import { cn } from "@/lib/utils";

export type IconVariant = "boxes" | "box" | "circle-dashed";

export default function ClusterIcon({
  iconVariant,
  color,
  isSelected,
  isPaywall,
}: {
  iconVariant: IconVariant;
  color: string;
  isSelected?: boolean;
  isPaywall?: boolean;
}) {
  return (
    <div className={cn("size-4 flex justify-center items-center", { "blur-[5px]": isPaywall })}>
      {iconVariant === "boxes" ? (
        <Boxes
          className="size-4.5 shrink-0"
          fill={withOpacity(color, 0.1)}
          stroke={withOpacity(color, 0.7)}
          strokeWidth={1}
        />
      ) : iconVariant === "circle-dashed" ? (
        <CircleDashed className="size-3.5 shrink-0" stroke={color} />
      ) : (
        <Box
          fill={isSelected ? withOpacity(color, 0.5) : withOpacity(color, 0.1)}
          stroke={isSelected ? color : withOpacity(color, 0.7)}
          className="size-3.5 shrink-0"
          strokeWidth={1.5}
        />
      )}
    </div>
  );
}
