"use client";

import React, { useEffect, useRef, useState } from "react";
import { Line, LineChart, YAxis } from "recharts";

import { Skeleton } from "@/components/ui/skeleton";

interface SignalSparklineProps {
  data: { timestamp: string; count: number }[];
  maxCount?: number;
  isLoading?: boolean;
}

export default function SignalSparkline({ data, maxCount, isLoading }: SignalSparklineProps) {
  const height = 48;
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    if (rect.width > 0) {
      setWidth(rect.width);
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setWidth(w);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (isLoading) {
    return (
      <div ref={containerRef} className="w-full" style={{ height }}>
        <Skeleton className="w-full h-full rounded-sm" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div ref={containerRef} className="w-full flex items-center" style={{ height }}>
        <span className="text-muted-foreground text-xs">No data</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full" style={{ height }}>
      {width > 0 && (
        <LineChart width={width} height={height} data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <YAxis domain={[0, Math.max(maxCount ?? 1, 1)]} hide />
          <Line
            activeDot={false}
            type="linear"
            dataKey="count"
            stroke="hsl(var(--primary))"
            strokeWidth={1}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      )}
    </div>
  );
}
