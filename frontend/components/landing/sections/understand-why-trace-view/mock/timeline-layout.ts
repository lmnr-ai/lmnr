import { type MockSpan } from "../../demo-trace";

export interface TimelineBar {
  span: MockSpan;
  /** Percentages of the timeline's full width. */
  left: number;
  width: number;
  row: number;
}

export interface TimelineLayout {
  bars: TimelineBar[];
  totalRows: number;
  /** The run's real length. The MARKERS are spaced against this. */
  totalDurationMs: number;
}

/** Bar positions. TWO denominators, deliberately, because the product has two:
 *  bars are drawn against the duration rounded up to a whole second, markers
 *  against the real one — which is what leaves the root bar short of the edge. */
export const timelineLayout = (spans: MockSpan[]): TimelineLayout => {
  if (spans.length === 0) return { bars: [], totalRows: 0, totalDurationMs: 0 };

  const startMs = Math.min(...spans.map((s) => s.startMs));
  const endMs = Math.max(...spans.map((s) => s.endMs));
  const totalDurationMs = endMs - startMs;
  const axisMs = Math.ceil(totalDurationMs / 1000) * 1000;

  const rowOf = new Map<string, number>();
  const occupancy: { left: number; right: number }[][] = [];

  // Gravity: a span falls as high as it fits, but never above its parent. The
  // input is already parent-before-child, so one pass is enough.
  const bars = spans.map((span) => {
    const left = ((span.startMs - startMs) / axisMs) * 100;
    const width = ((span.endMs - span.startMs) / axisMs) * 100;
    const right = left + width;

    let row = span.parentSpanId ? (rowOf.get(span.parentSpanId) ?? -1) + 1 : 0;
    while ((occupancy[row] ?? []).some((o) => !(right <= o.left || left >= o.right))) row++;

    rowOf.set(span.spanId, row);
    (occupancy[row] ??= []).push({ left, right });
    return { span, left, width, row };
  });

  return { bars, totalRows: occupancy.length, totalDurationMs };
};

// ── Time markers ─────────────────────────────────────────────────────

/** The product's ladder of "nice" intervals, cut at the top: this run is 25
 *  seconds, so nothing above a minute can ever be picked. */
const INTERVALS_MS = [100, 250, 500, 1000, 2000, 5000, 10000, 15000, 20000, 30000, 60000];

/** Below this the labels start colliding, so the next interval up is taken. */
const MIN_MARKER_SPACING_PX = 70;

export interface TimeMarker {
  label: string;
  positionPercent: number;
}

export const formatTimeMarkerLabel = (ms: number): string => {
  if (ms === 0) return "0s";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) {
    const seconds = ms / 1000;
    return Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(1).replace(/\.0$/, "")}s`;
  }
  const minutes = ms / 60000;
  return Number.isInteger(minutes) ? `${minutes}m` : `${minutes.toFixed(1).replace(/\.0$/, "")}m`;
};

/** Markers at the finest interval that still clears MIN_MARKER_SPACING_PX at
 *  the timeline's current pixel width (container width times zoom). */
export const timeMarkers = (totalDurationMs: number, timelineWidthPx: number): TimeMarker[] => {
  if (totalDurationMs <= 0 || timelineWidthPx <= 0) return [];

  const interval =
    INTERVALS_MS.find((candidate) => timelineWidthPx / (totalDurationMs / candidate) >= MIN_MARKER_SPACING_PX) ??
    INTERVALS_MS[INTERVALS_MS.length - 1];

  const markers: TimeMarker[] = [];
  for (let ms = 0; ms <= totalDurationMs; ms += interval) {
    markers.push({ label: formatTimeMarkerLabel(ms), positionPercent: (ms / totalDurationMs) * 100 });
  }
  return markers;
};
