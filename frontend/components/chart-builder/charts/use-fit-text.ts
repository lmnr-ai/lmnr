import { useCallback, useEffect, useState } from "react";

import { measureTextWidth } from "@/lib/measure-text-width";

const REFERENCE_PX = 100;
const MAX_CACHED = 500;

const widths = new Map<string, number>();

/** Width of `text` in em: measured once at 100px and scaled, since width grows linearly with size. */
const measureEm = (text: string, style: CSSStyleDeclaration): number => {
  const key = [style.fontWeight, style.fontFamily, style.fontVariantNumeric, text].join("|");
  const cached = widths.get(key);
  if (cached !== undefined) return cached;
  const em = measureTextWidth(text, style, `${REFERENCE_PX}px`) / REFERENCE_PX;
  if (widths.size >= MAX_CACHED) widths.clear();
  widths.set(key, em);
  return em;
};

export interface Box {
  width: number;
  height: number;
  /** Live computed style of the box, so measurement uses the font that renders. */
  style: CSSStyleDeclaration;
}

/**
 * Tracks an element's content box; refits once web fonts load, since fallback metrics differ. A
 * callback ref, so an element that mounts after the first render (data arriving) is still observed.
 */
export const useFitBox = <T extends HTMLElement>() => {
  const [box, setBox] = useState<Box | null>(null);
  const [, setFontsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void document.fonts.ready.then(() => {
      if (!active) return;
      widths.clear();
      setFontsLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const ref = useCallback((element: T | null) => {
    if (!element) return;
    const style = getComputedStyle(element);
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height, style }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, box };
};

interface FitOptions {
  maxLines: number;
  minSize: number;
  maxSize: number;
  lineHeight: number;
  /** Share of the box the text may fill on each axis. */
  fill: number;
}

/**
 * Largest font size at which `text` fits `box` on 1..maxLines lines, as Grafana's stat panel sizes
 * its value. Lines break only between words: n lines are estimated as max(width / n, longest word),
 * and the fill margin absorbs uneven breaks.
 */
export const fitText = (text: string, box: Box, options: FitOptions) => {
  const em = measureEm(text, box.style);
  const words = text.split(/\s+/).filter(Boolean);
  const maxLines = Math.min(options.maxLines, Math.max(words.length, 1));
  const longestWord = maxLines > 1 ? Math.max(...words.map((word) => measureEm(word, box.style))) : em;
  let best = { size: 0, lines: 1 };
  for (let lines = 1; lines <= maxLines; lines++) {
    const byWidth = (box.width * options.fill) / Math.max(em / lines, longestWord);
    const byHeight = (box.height * options.fill) / (lines * options.lineHeight);
    const size = Math.min(byWidth, byHeight, options.maxSize);
    if (size > best.size) best = { size, lines };
  }
  return { size: Math.max(best.size, options.minSize), lines: best.lines };
};
