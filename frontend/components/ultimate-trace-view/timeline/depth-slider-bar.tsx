"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface DepthSliderBarProps {
  granularityDepth: number;
  maxDepth: number;
  onDepthChange: (depth: number) => void;
  isLoading?: boolean;
}

export default function DepthSliderBar({ granularityDepth, maxDepth, onDepthChange, isLoading }: DepthSliderBarProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-4">
        <span className="text-[11px] text-secondary-foreground select-none">Overview</span>
        <Skeleton className="h-5 w-24 rounded-md" />
        <span className="text-[11px] text-secondary-foreground select-none">Detail</span>
      </div>
    );
  }

  if (maxDepth === 0) return null;

  return (
    <div className="flex items-center gap-4">
      <span className="text-[11px] text-secondary-foreground select-none">Overview</span>
      <div className="flex items-center gap-1 rounded-md border border-border bg-[#1b1b1c] p-0.5">
        {Array.from({ length: maxDepth + 1 }, (_, i) => (
          <button
            key={i}
            className={cn(
              "w-8 h-4 rounded-sm flex items-center justify-center transition-colors",
              i === granularityDepth ? "bg-[#5f6166]" : "hover:bg-[#5f6166]/40"
            )}
            onClick={() => onDepthChange(i)}
            title={`Depth ${i}`}
          >
            <div className="size-1 rounded-full bg-secondary-foreground" />
          </button>
        ))}
      </div>
      <span className="text-[11px] text-secondary-foreground select-none">Detail</span>
    </div>
  );
}
