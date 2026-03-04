"use client";

import { Slider } from "@/components/ui/slider";

import { useTraceDiffStore } from "../trace-diff-store";

const DepthSliderBar = () => {
  const { timelineDepth, maxTreeDepth, setTimelineDepth } = useTraceDiffStore((s) => ({
    timelineDepth: s.timelineDepth,
    maxTreeDepth: s.maxTreeDepth,
    setTimelineDepth: s.setTimelineDepth,
  }));

  if (maxTreeDepth === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b bg-background sticky top-0 z-10">
      <span className="text-xs text-muted-foreground whitespace-nowrap">Collapse</span>
      <Slider
        min={0}
        max={maxTreeDepth}
        step={1}
        value={[timelineDepth]}
        onValueChange={([value]) => setTimelineDepth(value)}
        className="flex-1 max-w-xs"
      />
      <span className="text-xs text-muted-foreground whitespace-nowrap">Expand</span>
    </div>
  );
};

export default DepthSliderBar;
