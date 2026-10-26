import { ArrowUpRight } from "lucide-react";

import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// The tooltip swatch reuses the bar fill so it matches what was hovered.
const BAR_FILL = "var(--color-emphasis-2)";

interface BarRowProps {
  category: string;
  value: number;
  formattedValue: string;
  max: number;
  valueLabel: string;
  onClick?: () => void;
}

const BarRow = ({ category, value, formattedValue, max, valueLabel, onClick }: BarRowProps) => (
  <>
    <Tooltip delayDuration={0} disableHoverableContent>
      <TooltipTrigger asChild>
        <div
          role={onClick ? "button" : undefined}
          onClick={onClick}
          className={cn("group relative flex h-8 min-w-0 items-center", onClick && "cursor-pointer")}
        >
          <div
            className={cn("absolute inset-y-0 left-0 rounded", onClick && "transition-opacity group-hover:opacity-60")}
            // Labels sit on the bar, so a neutral emphasis fill keeps them readable in both themes.
            style={{
              width: `${max > 0 ? (Math.max(0, value) / max) * 100 : 0}%`,
              backgroundColor: BAR_FILL,
            }}
          />
          <span className="relative flex min-w-0 items-center gap-1.5 px-2 text-sm text-foreground">
            <span className="truncate">{category}</span>
            {onClick && <ArrowUpRight className="size-4 shrink-0" />}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          side="top"
          align="start"
          className="pointer-events-none grid min-w-32 gap-1.5 rounded-lg border px-2.5 py-1.5"
        >
          {category && <div className="font-medium">{category}</div>}
          <div className="flex items-center gap-2 leading-none">
            <div className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: BAR_FILL }} />
            <span className="flex-1 text-muted-foreground">{valueLabel}</span>
            <span className="font-medium text-foreground">{value.toLocaleString()}</span>
          </div>
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
    <span className="flex h-8 items-center justify-end text-sm text-foreground">{formattedValue}</span>
  </>
);

export default BarRow;
