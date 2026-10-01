export const CHART_WIDTH = 880;
export const CHART_HEIGHT = 384;
export const FIRST_COLUMN_WIDTH = 54;
export const LAST_ROW_HEIGHT = FIRST_COLUMN_WIDTH;
export const GRID_CELL_SIZE = 32;
export const MIN_DESC_F1 = 62.5;
export const MAX_DESC_F1 = 82.5;

const MIN_TRACES_PER_DOLLAR = -5;
const MAX_TRACES_PER_DOLLAR = 925;

export const tracesPerDollarToX = (value: number) =>
  FIRST_COLUMN_WIDTH +
  ((value - MIN_TRACES_PER_DOLLAR) / (MAX_TRACES_PER_DOLLAR - MIN_TRACES_PER_DOLLAR)) *
    (CHART_WIDTH - FIRST_COLUMN_WIDTH);

export const descF1ToY = (value: number) =>
  ((MAX_DESC_F1 - value) / (MAX_DESC_F1 - MIN_DESC_F1)) * (CHART_HEIGHT - LAST_ROW_HEIGHT);

export const percentX = (value: number) => `${(value / CHART_WIDTH) * 100}%`;
export const percentY = (value: number) => `${(value / CHART_HEIGHT) * 100}%`;
export const plotPercentX = (value: number) =>
  `${((value - FIRST_COLUMN_WIDTH) / (CHART_WIDTH - FIRST_COLUMN_WIDTH)) * 100}%`;
export const plotPercentY = (value: number) => `${(value / (CHART_HEIGHT - LAST_ROW_HEIGHT)) * 100}%`;
export const scaledWidth = (value: number) => `${value / (CHART_WIDTH / 100)}cqw`;
export const scaledWidthAtLeast = (value: number, minimumPx: number) => `max(${scaledWidth(value)}, ${minimumPx}px)`;
