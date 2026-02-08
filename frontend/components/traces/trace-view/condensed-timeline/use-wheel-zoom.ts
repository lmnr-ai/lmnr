import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

import { MAX_ZOOM, MIN_ZOOM } from "@/components/traces/trace-view/trace-view-store";

const ZOOM_INCREMENT = 0.5;

/**
 * Hook for handling cmd/ctrl+scroll zoom on the condensed timeline.
 * Uses a ref to track current zoom value so the effect doesn't depend on zoom changing.
 * This ensures the wheel listener is attached on mount regardless of zoom state changes.
 */
export function useWheelZoom(
  scrollRef: RefObject<HTMLDivElement | null>,
  zoom: number,
  setZoom: (zoom: number) => void
) {
  const zoomRef = useRef(zoom);
  const setZoomRef = useRef(setZoom);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    setZoomRef.current = setZoom;
  }, [setZoom]);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;

      e.preventDefault();

      const direction = e.deltaY < 0 ? "in" : e.deltaY > 0 ? "out" : null;
      if (!direction) return;

      const currentZoom = zoomRef.current;

      // Get current state before zoom
      const oldScrollLeft = container.scrollLeft;
      const oldScrollWidth = container.scrollWidth;
      const containerWidth = container.clientWidth;
      const containerRect = container.getBoundingClientRect();

      // Mouse position relative to container
      const mouseX = e.clientX - containerRect.left;

      // Content position under mouse as fraction of total width
      const contentX = oldScrollLeft + mouseX;
      const fraction = contentX / oldScrollWidth;

      // Calculate new zoom
      const newZoom =
        direction === "in"
          ? currentZoom + ZOOM_INCREMENT
          : currentZoom - ZOOM_INCREMENT;

      // Don't do anything if zoom would be outside limits
      if (newZoom < MIN_ZOOM || newZoom > MAX_ZOOM) return;

      // Calculate new scroll width and position
      const zoomRatio = newZoom / currentZoom;
      const newScrollWidth = oldScrollWidth * zoomRatio;
      const newScrollLeft = fraction * newScrollWidth - mouseX;

      // Update zoom via ref
      setZoomRef.current(newZoom);

      // Adjust scroll position (use requestAnimationFrame to ensure DOM has updated)
      requestAnimationFrame(() => {
        container.scrollLeft = Math.max(0, Math.min(newScrollLeft, newScrollWidth - containerWidth));
      });
    };

    // passive: false is required for preventDefault() to work on wheel events
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, []); // Empty deps - runs once on mount, uses refs for current values
}
