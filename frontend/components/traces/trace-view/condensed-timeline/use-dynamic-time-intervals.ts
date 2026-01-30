import { useCallback, useEffect, useMemo, useState } from "react";

// ============================================================================
// Dynamic Time Intervals
// ============================================================================

const TIME_INTERVAL_VALUES_MS = [
  100, 250, 500, 1000, 2000, 5000, 10000, 15000, 20000, 30000, 60000, 120000, 300000, 600000, 900000, 1800000, 3600000,
] as const;

const MIN_MARKER_SPACING_PX = 70;

export interface TimeMarker {
  label: string; // "0s", "1.5s", "2min"
  positionPercent: number; // 0-100
  timeMs: number;
}

/**
 * Formats a time value in milliseconds to a human-readable label.
 * - < 1s: shows ms (e.g., "100ms", "500ms")
 * - < 60s: shows seconds with decimals if needed (e.g., "1s", "1.5s", "30s")
 * - >= 60s: shows minutes (e.g., "1min", "2min", "5min")
 */
export function formatTimeMarkerLabel(ms: number): string {
  if (ms === 0) return "0s";

  if (ms < 1000) {
    return `${ms}ms`;
  }

  if (ms < 60000) {
    const seconds = ms / 1000;
    // Show decimal only if not a whole number
    if (Number.isInteger(seconds)) {
      return `${seconds}s`;
    }
    return `${seconds.toFixed(1).replace(/\.0$/, "")}s`;
  }

  const minutes = ms / 60000;
  if (Number.isInteger(minutes)) {
    return `${minutes}m`;
  }
  return `${minutes.toFixed(1).replace(/\.0$/, "")}m`;
}

/**
 * Computes dynamic time markers based on timeline width and duration.
 * Uses predefined "nice" intervals and ensures minimum pixel spacing between markers.
 */
function computeDynamicTimeMarkers(totalDurationMs: number, timelineWidthPx: number): TimeMarker[] {
  if (totalDurationMs <= 0 || timelineWidthPx <= 0) {
    return [];
  }

  // Find the smallest interval that gives us adequate spacing
  let selectedInterval = TIME_INTERVAL_VALUES_MS[TIME_INTERVAL_VALUES_MS.length - 1];

  for (const candidateInterval of TIME_INTERVAL_VALUES_MS) {
    const numberOfMarkers = totalDurationMs / candidateInterval;
    const pixelSpacing = timelineWidthPx / numberOfMarkers;

    if (pixelSpacing >= MIN_MARKER_SPACING_PX) {
      selectedInterval = candidateInterval;
      break;
    }
  }

  // Generate markers from 0 to totalDurationMs at the selected interval
  const markers: TimeMarker[] = [];

  for (let timeMs = 0; timeMs <= totalDurationMs; timeMs += selectedInterval) {
    markers.push({
      label: formatTimeMarkerLabel(timeMs),
      positionPercent: (timeMs / totalDurationMs) * 100,
      timeMs,
    });
  }

  return markers;
}

interface UseDynamicTimeIntervalsResult {
  markers: TimeMarker[];
  setContainerRef: (node: HTMLDivElement | null) => void;
}

interface UseDynamicTimeIntervalsProps {
  totalDurationMs: number;
  zoom: number;
}

/**
 * Custom hook that computes dynamic time markers based on container width and zoom level.
 * Uses ResizeObserver to track container width changes and recalculates markers accordingly.
 * Returns a callback ref that should be attached to the container element.
 */
export function useDynamicTimeIntervals({
  totalDurationMs,
  zoom,
}: UseDynamicTimeIntervalsProps): UseDynamicTimeIntervalsResult {
  const [containerWidth, setContainerWidth] = useState(0);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  // Callback ref to capture the container element
  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    setContainer(node);
  }, []);

  // Track container width with ResizeObserver
  useEffect(() => {
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(container);
    // Set initial width
    setContainerWidth(container.clientWidth);

    return () => {
      resizeObserver.disconnect();
    };
  }, [container]);

  // Compute markers based on timeline width (container * zoom) and duration
  const markers = useMemo(() => {
    const timelineWidthPx = containerWidth * zoom;
    return computeDynamicTimeMarkers(totalDurationMs, timelineWidthPx);
  }, [containerWidth, zoom, totalDurationMs]);

  return { markers, setContainerRef };
}
