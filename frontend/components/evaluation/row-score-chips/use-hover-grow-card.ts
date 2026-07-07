"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface HoverRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Timer/rect bookkeeping for the "grows out of the trigger" hover-card
 * choreography shared with signal/clusters-section/cluster-list/cluster-item.tsx:
 * 500ms open delay, measured trigger rect, 80ms delayed close, close on wheel
 * and on perceptible window scroll. Extracted so the chip component (which
 * also owns the trigger markup + portal JSX) stays under the house line cap.
 *
 * `estimatedWidth` is the width the card grows into; the measured left is
 * clamped so a right-edge trigger's card doesn't grow off-screen (we own the
 * positioning, so this is our equivalent of Radix Popper's avoidCollisions).
 */
export function useHoverGrowCard<T extends HTMLElement>(estimatedWidth?: number) {
  const [hovered, setHovered] = useState(false);
  const [rect, setRect] = useState<HoverRect | null>(null);
  const triggerRef = useRef<T>(null);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLeaveTimeout = useCallback(() => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
  }, []);

  const clearOpenTimeout = useCallback(() => {
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
      if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current);
    },
    []
  );

  useEffect(() => {
    if (!hovered) return;
    const startY = window.scrollY;
    const startX = window.scrollX;
    const onScroll = () => {
      const dy = Math.abs(window.scrollY - startY);
      const dx = Math.abs(window.scrollX - startX);
      if (dy < 4 && dx < 4) return;
      clearLeaveTimeout();
      setHovered(false);
      setRect(null);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hovered, clearLeaveTimeout]);

  const handleMouseEnter = useCallback(() => {
    clearLeaveTimeout();
    clearOpenTimeout();
    openTimeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const r = triggerRef.current.getBoundingClientRect();
        const margin = 8;
        const width = estimatedWidth ?? r.width;
        const maxLeft = window.innerWidth - width - margin;
        const left = Math.max(margin, Math.min(r.left, maxLeft));
        setRect({ top: r.top, left, width: r.width, height: r.height });
        setHovered(true);
      }
    }, 500);
  }, [clearLeaveTimeout, clearOpenTimeout, estimatedWidth]);

  const scheduleClose = useCallback(() => {
    clearOpenTimeout();
    clearLeaveTimeout();
    leaveTimeoutRef.current = setTimeout(() => {
      setHovered(false);
      setRect(null);
    }, 80);
  }, [clearLeaveTimeout, clearOpenTimeout]);

  const closeImmediately = useCallback(() => {
    clearOpenTimeout();
    clearLeaveTimeout();
    setHovered(false);
    setRect(null);
  }, [clearOpenTimeout, clearLeaveTimeout]);

  return { triggerRef, hovered, rect, handleMouseEnter, scheduleClose, closeImmediately };
}
