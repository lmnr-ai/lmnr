import { type ChartScene } from "@tanstack/charts";

import { type SeriesRow } from "./definition";
import { MarkerTick } from "./marker";
import { type PlotMarker } from "./types";

type Scene = ChartScene<SeriesRow, string, number>;

/** Project timestamp annotations from the domain; never expose scene coordinates to callers. */
export default function PlotMarkers({ markers, scene }: { markers: PlotMarker[]; scene: Scene | null }) {
  const xScale = scene?.scales.x;
  if (!scene || !xScale || markers.length === 0) return null;
  const domain = new Set(xScale.domain);
  const top = scene.chart.y;
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      {markers
        .filter((marker) => domain.has(marker.timestamp))
        .map((marker) => {
          const x = xScale.map(marker.timestamp) + xScale.bandwidth / 2;
          return (
            <g key={marker.timestamp}>
              <path
                d={`M${x},${top} V${top + scene.chart.height}`}
                stroke="var(--color-muted-foreground)"
                strokeDasharray="4 4"
                opacity={0.65}
              />
              <g className="pointer-events-auto">
                <MarkerTick x1={x} y1={top} y2={top} label={marker.label} href={marker.href} tooltip={marker.tooltip} />
              </g>
            </g>
          );
        })}
    </svg>
  );
}
