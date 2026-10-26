import { type ChartPoint } from "@tanstack/charts";

import { type SeriesRow } from "./definition";

/**
 * One dot per series at the hovered x. Drawn in the DOM from the focus group,
 * because a `whenFocused(dot(...))` mark over every row tripled hover and resize cost on large charts.
 */
const FocusDots = ({ points }: { points: readonly ChartPoint<SeriesRow, string, number>[] }) =>
  points.map((point) => (
    <div
      key={point.datum.series}
      className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background"
      style={{ left: point.x, top: point.y, background: point.color }}
    />
  ));

export default FocusDots;
