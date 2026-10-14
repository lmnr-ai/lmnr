"use client";

import { type RefObject, useEffect, useState } from "react";

import { BASE_COLS, CELL } from "./geometry";

// Starts at BASE_COLS so SSR and the first client render agree. `compact` means
// the column is narrower than the diagram, i.e. mobile.
export const useGridColumns = (ref: RefObject<HTMLElement | null>) => {
  const [state, setState] = useState({ cols: BASE_COLS, compact: false });

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const update = (width: number) =>
      setState({ cols: Math.max(BASE_COLS, Math.floor(width / CELL)), compact: width < BASE_COLS * CELL });
    update(element.getBoundingClientRect().width);

    const observer = new ResizeObserver(([entry]) => update(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return state;
};
