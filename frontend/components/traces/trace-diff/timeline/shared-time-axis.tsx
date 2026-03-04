"use client";

import { useMemo } from "react";

import { formatTimeMarkerLabel } from "@/components/traces/trace-view/condensed-timeline/use-dynamic-time-intervals";

const TIME_INTERVAL_VALUES_MS = [
  100, 250, 500, 1000, 2000, 5000, 10000, 15000, 20000, 30000, 60000, 120000, 300000, 600000, 900000, 1800000, 3600000,
] as const;

const MIN_MARKER_SPACING_PX = 70;

interface SharedTimeAxisProps {
  sharedDurationMs: number;
  timelineWidthPx: number;
}

const SharedTimeAxis = ({ sharedDurationMs, timelineWidthPx }: SharedTimeAxisProps) => {
  const markers = useMemo(() => {
    if (sharedDurationMs <= 0 || timelineWidthPx <= 0) return [];

    let selectedInterval = TIME_INTERVAL_VALUES_MS[TIME_INTERVAL_VALUES_MS.length - 1];
    for (const candidateInterval of TIME_INTERVAL_VALUES_MS) {
      const numberOfMarkers = sharedDurationMs / candidateInterval;
      const pixelSpacing = timelineWidthPx / numberOfMarkers;
      if (pixelSpacing >= MIN_MARKER_SPACING_PX) {
        selectedInterval = candidateInterval;
        break;
      }
    }

    const result: { label: string; positionPercent: number }[] = [];
    for (let timeMs = 0; timeMs <= sharedDurationMs; timeMs += selectedInterval) {
      result.push({
        label: formatTimeMarkerLabel(timeMs),
        positionPercent: (timeMs / sharedDurationMs) * 100,
      });
    }
    return result;
  }, [sharedDurationMs, timelineWidthPx]);

  return (
    <div className="relative h-5 border-b flex-none" style={{ width: timelineWidthPx }}>
      {markers.map((marker) => (
        <div
          key={marker.positionPercent}
          className="absolute top-0 h-full flex flex-col items-start"
          style={{ left: `${marker.positionPercent}%` }}
        >
          <span className="text-[10px] text-muted-foreground pl-1 leading-tight">{marker.label}</span>
          <div className="w-px h-1.5 bg-border" />
        </div>
      ))}
    </div>
  );
};

export default SharedTimeAxis;
