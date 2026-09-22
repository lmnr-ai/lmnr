export const CHART_WIDTH = 880;
export const CHART_HEIGHT = 384;
export const FIRST_COLUMN_WIDTH = 54;
export const LAST_ROW_HEIGHT = 44;
export const GRID_CELL_SIZE = 32;
export const MIN_INTELLIGENCE = 64;
export const MAX_INTELLIGENCE = 95;

const MIN_TRACES_PER_DOLLAR = -5;
const MAX_TRACES_PER_DOLLAR = 255;

export const tracesPerDollarToX = (value: number) =>
  FIRST_COLUMN_WIDTH +
  ((value - MIN_TRACES_PER_DOLLAR) / (MAX_TRACES_PER_DOLLAR - MIN_TRACES_PER_DOLLAR)) *
    (CHART_WIDTH - FIRST_COLUMN_WIDTH);

export const intelligenceToY = (value: number) =>
  ((MAX_INTELLIGENCE - value) / (MAX_INTELLIGENCE - MIN_INTELLIGENCE)) * (CHART_HEIGHT - LAST_ROW_HEIGHT);

export const percentX = (value: number) => `${(value / CHART_WIDTH) * 100}%`;
export const percentY = (value: number) => `${(value / CHART_HEIGHT) * 100}%`;
export const scaledWidth = (value: number) => `${value / (CHART_WIDTH / 100)}cqw`;
