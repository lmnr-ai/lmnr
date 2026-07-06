"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_ENTER_DELAY_MS = 150;
const DEFAULT_LEAVE_DELAY_MS = 275;

/**
 * Debounced hover state: `hovering` flips true after a short dwell (so a
 * pointer just passing through doesn't trigger it) and flips false after a
 * grace period on leave (so moving toward an adjacent surface doesn't
 * flicker). Attach `onMouseEnter`/`onMouseLeave` to every DOM node that
 * should count as "still hovering" the same interactive region — since they
 * share one timer pair, entering any of them cancels a pending collapse.
 */
export function useHoverIntent(enterDelayMs = DEFAULT_ENTER_DELAY_MS, leaveDelayMs = DEFAULT_LEAVE_DELAY_MS) {
  const [hovering, setHovering] = useState(false);
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (enterTimer.current) clearTimeout(enterTimer.current);
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    enterTimer.current = null;
    leaveTimer.current = null;
  }, []);

  const onMouseEnter = useCallback(() => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    if (hovering || enterTimer.current) return;
    enterTimer.current = setTimeout(() => {
      enterTimer.current = null;
      setHovering(true);
    }, enterDelayMs);
  }, [hovering, enterDelayMs]);

  const onMouseLeave = useCallback(() => {
    if (enterTimer.current) {
      clearTimeout(enterTimer.current);
      enterTimer.current = null;
    }
    leaveTimer.current = setTimeout(() => {
      leaveTimer.current = null;
      setHovering(false);
    }, leaveDelayMs);
  }, [leaveDelayMs]);

  /** Force-collapse immediately, bypassing the grace period (row click, Esc). */
  const collapseNow = useCallback(() => {
    clearTimers();
    setHovering(false);
  }, [clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  return { hovering, onMouseEnter, onMouseLeave, collapseNow };
}
