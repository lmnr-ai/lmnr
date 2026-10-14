"use client";

import { type RefObject, useEffect, useState } from "react";

import { BASE_COLS, CELL } from "./geometry";

// Starts at BASE_COLS so SSR and the first client render agree.
export const useGridColumns = (ref: RefObject<HTMLElement | null>) => {
  const [cols, setCols] = useState(BASE_COLS);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const update = (width: number) => setCols(Math.max(BASE_COLS, Math.floor(width / CELL)));
    update(element.getBoundingClientRect().width);

    const observer = new ResizeObserver(([entry]) => update(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return cols;
};
