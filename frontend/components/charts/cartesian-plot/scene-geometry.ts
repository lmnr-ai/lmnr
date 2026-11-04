import { type ChartScene } from "@tanstack/charts";

import { type SeriesRow } from "./definition";

type Scene = ChartScene<SeriesRow, string, number>;

/** onRender runs each paint; retain state only when domain-to-pixel mapping changes. */
export const samePlotGeometry = (previous: Scene, next: Scene): boolean => {
  const oldX = previous.scales.x;
  const newX = next.scales.x;
  const oldY = previous.scales.y;
  const newY = next.scales.y;
  if (!oldX || !newX || !oldY || !newY) return false;
  return (
    previous.chart.x === next.chart.x &&
    previous.chart.y === next.chart.y &&
    previous.chart.width === next.chart.width &&
    previous.chart.height === next.chart.height &&
    oldX.bandwidth === newX.bandwidth &&
    oldX.domain.length === newX.domain.length &&
    oldX.domain.every((value, index) => value === newX.domain[index]) &&
    oldY.domain.length === newY.domain.length &&
    oldY.domain.every((value, index) => value === newY.domain[index])
  );
};
