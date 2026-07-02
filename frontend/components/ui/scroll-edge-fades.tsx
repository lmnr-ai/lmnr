"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { type RefObject, useEffect, useState } from "react";

interface ScrollEdgeFadesProps {
  // The scrollable container. useScroll reads scrollXProgress from this element.
  scrollRef: RefObject<HTMLDivElement | null>;
  // Width of each fade in px. Defaults to 64.
  width?: number;
}

/**
 * Left/right gradient overlays that animate in/out based on horizontal scroll progress
 * inside the given container.
 *   - Left fade fades IN as progress crosses [0, 0.02] (so it appears once you've started
 *     scrolling away from the start).
 *   - Right fade fades OUT as progress crosses [0.98, 1] (so it disappears as you reach
 *     the end).
 * If the container has no overflow to scroll, neither fade renders so a non-scrollable
 * strip doesn't look like it's hiding hidden content.
 *
 * Must be rendered inside a `position: relative` parent — the fades use `absolute inset-y-0`.
 */
export default function ScrollEdgeFades({ scrollRef, width = 64 }: ScrollEdgeFadesProps) {
  const { scrollXProgress } = useScroll({ container: scrollRef });
  const leftOpacity = useTransform(scrollXProgress, [0, 0.02], [0, 1]);
  const rightOpacity = useTransform(scrollXProgress, [0.98, 1], [1, 0]);

  const [hasOverflow, setHasOverflow] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setHasOverflow(el.scrollWidth > el.clientWidth + 1);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef]);

  if (!hasOverflow) return null;

  return (
    <>
      <motion.div
        aria-hidden
        style={{ opacity: leftOpacity, width }}
        className="absolute inset-y-0 left-0 z-10 bg-gradient-to-r from-background to-transparent pointer-events-none"
      />
      <motion.div
        aria-hidden
        style={{ opacity: rightOpacity, width }}
        className="absolute inset-y-0 right-0 z-10 bg-gradient-to-l from-background to-transparent pointer-events-none"
      />
    </>
  );
}
