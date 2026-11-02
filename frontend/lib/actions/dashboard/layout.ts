// Chart placement on the 12-column dashboard grid. react-grid-layout compacts gaps upward on
// render and persists the result, so writes only have to keep stored layouts overlap-free;
// gaps they leave are fine.

import { z } from "zod/v4";

import { GRID_COLS } from "@/components/dashboards/types";

export const LayoutSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  w: z.number().int(),
  h: z.number().int(),
});

export type Layout = z.infer<typeof LayoutSchema>;

const AUTO_WIDTH = 4;
const AUTO_HEIGHT = 6;
const AUTO_SLOT_XS = [0, 4, 8];

export const validateLayout = ({ x, y, w, h }: Layout): string | undefined => {
  if (w < 1 || h < 1) return `w and h must be at least 1, got w=${w} h=${h}`;
  if (x < 0 || y < 0) return `x and y must be non-negative, got x=${x} y=${y}`;
  if (x + w > GRID_COLS) return `x + w must be at most ${GRID_COLS}, got x=${x} w=${w}`;
  return undefined;
};

export const overlaps = (a: Layout, b: Layout) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const sharesColumns = (layout: Layout, x: number, w: number) => layout.x < x + w && layout.x + layout.w > x;

/**
 * Moves each of `others` straight down until it clears `fixed` and every chart settled before
 * it. Top-down order keeps the vertical order of the moved charts.
 */
export const settle = <K>(fixed: Layout[], others: Array<[K, Layout]>): Array<[K, Layout]> => {
  const sorted = [...others]
    .map(([key, layout]): [K, Layout] => [key, { ...layout }])
    .sort(([, a], [, b]) => a.y - b.y || a.x - b.x);

  const placed = [...fixed];
  for (const [, layout] of sorted) {
    let blocker = placed.find((p) => overlaps(p, layout));
    while (blocker) {
      layout.y = blocker.y + blocker.h;
      blocker = placed.find((p) => overlaps(p, layout));
    }
    placed.push(layout);
  }
  return sorted;
};

/** The lowest-reaching of three 4-wide columns, under everything already in it. */
export const autoPlace = (placed: Layout[]): Layout => {
  const slots = AUTO_SLOT_XS.map((x) => ({
    x,
    bottom: Math.max(0, ...placed.filter((p) => sharesColumns(p, x, AUTO_WIDTH)).map((p) => p.y + p.h)),
  }));
  const best = slots.reduce((min, slot) => (slot.bottom < min.bottom ? slot : min));

  return { x: best.x, y: best.bottom, w: AUTO_WIDTH, h: AUTO_HEIGHT };
};
