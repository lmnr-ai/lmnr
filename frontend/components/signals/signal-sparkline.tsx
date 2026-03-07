"use client";

import React, { useEffect, useRef, useState } from "react";
import { Line, LineChart, YAxis } from "recharts";

interface SignalSparklineProps {
  data: { timestamp: string; count: number }[];
  maxCount?: number;
}

export default function SignalSparkline({ data, maxCount }: SignalSparklineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Set initial width immediately from layout
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

  if (!data || data.length === 0) {
    return (
      <div ref={containerRef} className="w-full flex items-center" style={{ height: 40 }}>
        <span className="text-muted-foreground text-xs">No data</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full" style={{ height: 40 }}>
      {width > 0 && (
        <LineChart width={width} height={40} data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <YAxis domain={[0, maxCount ?? "auto"]} hide />
          <Line
            type="linear"
            dataKey="count"
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      )}
    </div>
  );
}
