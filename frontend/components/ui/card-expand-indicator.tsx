import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

interface CardExpandIndicatorProps {
  expanded: boolean;
  /** Short relative timestamp shown to the left of the chevron (e.g. "2h ago"). */
  relativeTime?: string;
  /**
   * Also reveal on hover of a sibling body row, not just the card itself — used
   * by the trace card, whose collapsed body is a separate virtualized row that
   * carries the `sibling-body-hover` variant.
   */
  siblingBodyHover?: boolean;
  className?: string;
}

/**
 * The right-side cluster of a collapsible session card: a relative timestamp
 * plus a Collapse/Expand affordance that stays minimal until the card is
 * hovered — it relies on an ANCESTOR carrying the `group` class — then slides
 * its label open. The chevron points down when expanded, right (rotated -90°)
 * when collapsed. Extracted from the trace card so trace / evaluation / command
 * cards share one indicator.
 */
export function CardExpandIndicator({ expanded, relativeTime, siblingBodyHover, className }: CardExpandIndicatorProps) {
  return (
    <div className={cn("flex shrink-0 items-center gap-2 text-secondary-foreground", className)}>
      {relativeTime && <span className="whitespace-nowrap text-[13px] leading-[17px] ">{relativeTime}</span>}
      <span
        className={cn(
          "flex items-center justify-center whitespace-nowrap rounded-full py-0.5 pl-1 pr-1 text-xs font-medium leading-[17px]",
          "border-[rgba(232,232,232,0.1)] group-hover:gap-1 group-hover:border group-hover:bg-[rgba(232,232,232,0.05)] group-hover:pl-2.5",
          siblingBodyHover &&
            "sibling-body-hover:gap-1 sibling-body-hover:border sibling-body-hover:bg-[rgba(232,232,232,0.05)] sibling-body-hover:pl-2.5"
        )}
      >
        <span
          className={cn(
            "w-0 overflow-hidden opacity-0 transition-all duration-200 group-hover:w-[50px] group-hover:opacity-100",
            siblingBodyHover && "sibling-body-hover:w-[50px] sibling-body-hover:opacity-100"
          )}
        >
          {expanded ? "Collapse" : "Expand"}
        </span>
        <ChevronDown size={16} className={cn("transition-transform", !expanded && "-rotate-90")} />
      </span>
    </div>
  );
}
