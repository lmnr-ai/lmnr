import { type ChartScene } from "@tanstack/charts";

import { type TraceSeriesRow } from "./definition";

type Scene = ChartScene<TraceSeriesRow, string, number>;

// onRender fires on every paint; only replace the scene when the overlay's mapping can change.
export const sameZoomGeometry = (prev: Scene, next: Scene): boolean => {
  const oldX = prev.scales.x;
  const newX = next.scales.x;
  if (!oldX || !newX) return false;

  return (
    prev.chart.x === next.chart.x &&
    prev.chart.y === next.chart.y &&
    prev.chart.width === next.chart.width &&
    prev.chart.height === next.chart.height &&
    oldX.bandwidth === newX.bandwidth &&
    oldX.domain.length === newX.domain.length &&
    oldX.domain.every((value, index) => value === newX.domain[index])
  );
};
