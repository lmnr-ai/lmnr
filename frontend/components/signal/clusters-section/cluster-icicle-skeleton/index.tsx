// The icicle strip's loading state.
//
// A separate component, not the real strip fed placeholder nodes: the strip's
// job is the fold — measuring itself, deciding what it has room for, folding the
// rest into `+N` counters — and none of that means anything against clusters
// that do not exist. So this shares the strip's LOOK (band height, radius,
// surface step, gaps) and none of its machinery.
"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { BAND } from "../cluster-icicle/constants";
import { SHIMMER } from "./constants";
import { FOREST, layOut, ROOT_LEVEL } from "./forest";
import SkeletonColumn from "./skeleton-column";

interface Props {
  className?: string;
}

export default function ClusterIcicleSkeleton({ className }: Props) {
  const [phase, setPhase] = useState(0);

  // Advanced off wall-clock time rather than per frame, so the crest travels at
  // the same speed whatever the display's refresh rate is.
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const minStep = 1000 / SHIMMER.fps;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = now - last;
      if (dt < minStep) return;
      last = now;
      setPhase((p) => (p + (dt / 1000) * SHIMMER.speed) % 1);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div aria-hidden className={cn("relative w-full shrink-0", className)}>
      {/* The roots are the strip's top-level groups, so they take `groupGap`. */}
      <div className="flex w-full flex-row items-end" style={{ gap: BAND.groupGap }}>
        {layOut(FOREST, 0, 1).map((root, i) => (
          <SkeletonColumn key={i} node={root.node} phase={phase} level={ROOT_LEVEL} x={root.x} span={root.span} />
        ))}
      </div>
    </div>
  );
}
