import Link from "next/link";

import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { cn } from "@/lib/utils.ts";

import { type DateRange } from "./utils.ts";

export const RANGE_ITEM_CLASS =
  "relative flex w-full select-none items-center rounded-sm py-1.5 px-2 text-xs outline-none transition-colors";

export const exceedsRetention = (range: DateRange, maxHours?: number) =>
  maxHours != null && parseInt(range.value) > maxHours;

export const RangeItem = ({
  range,
  isSelected,
  isHighlighted,
  maxHours,
  billingHref,
  onSelect,
  onHighlight,
}: {
  range: DateRange;
  isSelected: boolean;
  isHighlighted: boolean;
  maxHours?: number;
  billingHref?: string;
  onSelect: (value: string) => void;
  onHighlight: () => void;
}) => {
  const locked = exceedsRetention(range, maxHours);
  const item = (
    <div
      role="option"
      aria-selected={isHighlighted}
      className={cn(
        RANGE_ITEM_CLASS,
        locked
          ? "cursor-not-allowed text-muted-foreground opacity-50"
          : "cursor-pointer hover:bg-accent hover:text-accent-foreground",
        (isHighlighted || isSelected) && !locked && "bg-accent text-accent-foreground"
      )}
      onMouseEnter={onHighlight}
      onClick={locked ? undefined : () => onSelect(range.value)}
    >
      {range.name}
    </div>
  );

  if (!locked) return item;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{item}</TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side="right" className="flex flex-col gap-1 p-2">
          <p className="text-xs">
            Data retention is limited to {maxHours != null ? Math.floor(maxHours / 24) : 0} days on your current plan.
          </p>
          {billingHref && (
            <Link href={billingHref} className="text-xs text-primary hover:underline">
              Upgrade to see more data
            </Link>
          )}
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
};
