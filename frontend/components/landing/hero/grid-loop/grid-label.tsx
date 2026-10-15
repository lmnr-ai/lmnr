import { cn } from "@/lib/utils";

import { type Rect } from "./geometry";

interface GridLabelProps {
  rect: Rect;
  text: string;
  opacity: number;
  align?: "left" | "center";
}

const GridLabel = ({ rect, text, opacity, align = "left" }: GridLabelProps) => (
  <div
    data-grid-item
    className={cn(
      "absolute flex h-[20px] items-center bg-surface-150 pr-[6px] pl-[8px] font-sans-landing text-[12px] leading-none whitespace-nowrap text-foreground-200",
      align === "center" && "justify-center"
    )}
    style={{ left: rect.x, top: rect.y, width: rect.w, opacity }}
  >
    {text}
  </div>
);

export default GridLabel;
