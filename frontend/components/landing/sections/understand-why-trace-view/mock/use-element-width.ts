"use client";

import { type RefObject, useEffect, useState } from "react";

/** An element's live client width, 0 before the first measurement. The
 *  timeline's marker interval is chosen in PIXELS, so the axis has to re-derive
 *  when the frame's media query changes its width. */
export const useElementWidth = (ref: RefObject<HTMLElement | null>): number => {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [ref]);

  return width;
};
