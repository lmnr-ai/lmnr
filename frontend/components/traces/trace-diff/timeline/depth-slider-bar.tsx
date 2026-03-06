"use client";

import { cn } from "@/lib/utils";

import { useTraceDiffStore } from "../store";

const DepthSliderBar = () => {
  const { timelineDepth, maxTreeDepth, setTimelineDepth } = useTraceDiffStore((s) => ({
    timelineDepth: s.timelineDepth,
    maxTreeDepth: s.maxTreeDepth,
    setTimelineDepth: s.setTimelineDepth,
  }));

  if (maxTreeDepth === 0) return null;

  return (
    <div className="flex items-center justify-center gap-4 px-2 py-1.5 border-b bg-background">
      <span className="text-[11px] text-secondary-foreground select-none">Overview</span>
      <div className="flex items-center gap-1 rounded-md border border-border bg-[#1b1b1c] p-0.5">
        {Array.from({ length: maxTreeDepth + 1 }, (_, i) => (
          <button
            key={i}
            className={cn(
              "w-8 h-4 rounded-sm flex items-center justify-center transition-colors",
              i === timelineDepth ? "bg-[#5f6166]" : "hover:bg-[#5f6166]/40"
            )}
            onClick={() => setTimelineDepth(i)}
            title={`Depth ${i}`}
          >
            <div className="size-1 rounded-full bg-secondary-foreground" />
          </button>
        ))}
      </div>
      <span className="text-[11px] text-secondary-foreground select-none">Detail</span>
    </div>
  );
};

export default DepthSliderBar;
