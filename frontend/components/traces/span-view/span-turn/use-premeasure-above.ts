import { type Virtualizer } from "@tanstack/react-virtual";
import { useEffect, useState } from "react";

const CHUNK = 3;

const whenIdle = (fn: () => void) => {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(fn, { timeout: 300 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 30);
  return () => clearTimeout(id);
};

/**
 * After a jump into the middle of the list, the rows above it only have estimated heights. Each one's first
 * measurement then corrects scrollTop while the user scrolls up, and that write cancels the browser's smooth wheel
 * scroll, so small scrolls stutter. This measures those rows ahead of time, a few per idle period and never while the
 * user scrolls. Returns the row indices to render in a hidden measuring layer.
 * `paused` while searching: hidden rows would register as search sources, and a match could scroll to an invisible row.
 */
export const usePremeasureAbove = (
  virtualizer: Virtualizer<HTMLDivElement, Element>,
  from: number,
  paused: boolean
): number[] => {
  // Rows below `cursor` are not measured yet. The window only moves on idle: measuring re-renders the list, and a
  // window derived from the size cache would sweep every row in back-to-back renders.
  const [cursor, setCursor] = useState(from);
  const top = paused ? 0 : Math.min(cursor, virtualizer.getVirtualItems()[0]?.index ?? 0);
  const bottom = Math.max(0, top - CHUNK);

  useEffect(() => {
    if (top <= 0) return;
    let cancel = () => {};
    const advance = () => {
      if (virtualizer.isScrolling) cancel = whenIdle(advance);
      else setCursor(bottom);
    };
    cancel = whenIdle(advance);
    return () => cancel();
  }, [top, bottom, virtualizer]);

  return top > 0 ? Array.from({ length: top - bottom }, (_, i) => bottom + i) : [];
};
