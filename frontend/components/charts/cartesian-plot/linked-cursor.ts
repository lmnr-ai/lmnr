import { createChartCursor } from "@tanstack/charts/cursor";

// One controller for every chart on the page, so hovering one shows the same x on all of them.
export const linkedCursorController = createChartCursor<string, number>();
