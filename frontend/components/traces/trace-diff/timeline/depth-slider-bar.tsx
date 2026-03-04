"use client";

import { cn } from "@/lib/utils";

import { useTraceDiffStore } from "../trace-diff-store";

const DepthSliderBar = () => {
  const { timelineDepth, maxTreeDepth, setTimelineDepth } = useTraceDiffStore((s) => ({
    timelineDepth: s.timelineDepth,
    maxTreeDepth: s.maxTreeDepth,
    setTimelineDepth: s.setTimelineDepth,
  }));

  if (maxTreeDepth === 0) return null;

  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b bg-background">
      {Array.from({ length: maxTreeDepth + 1 }, (_, i) => (
        <button
          key={i}
          className={cn(
            "size-4 rounded transition-colors flex items-center justify-center",
            i === timelineDepth ? "bg-foreground" : "bg-muted-foreground/20 hover:bg-muted-foreground/40"
          )}
          onClick={() => setTimelineDepth(i)}
          title={`Depth ${i}`}
        >
          <div
            className={cn(
              "rounded-full transition-colors",
              i === timelineDepth ? "bg-background size-1.5" : "bg-muted-foreground/60 size-1"
            )}
          />
        </button>
      ))}
    </div>
  );
};

export default DepthSliderBar;
