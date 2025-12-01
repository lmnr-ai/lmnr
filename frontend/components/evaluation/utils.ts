import { flow, isNumber, mean, round } from "lodash";

import { getOptimalTextColor, interpolateColor, normalizeValue, RGBColor, ScoreRange } from "@/lib/colors";

export type ScoreRanges = Record<string, ScoreRange>;
export type ScoreValue = number | undefined;
export type DisplayValue = string | number;

export const calculateDuration = (startTime: string, endTime: string): number =>
  (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000;

export const calculateTotalCost = (
  inputCost: number,
  outputCost: number,
  totalCost: number,
): number => {
  const value = totalCost > 0 ? Math.max(inputCost + outputCost, totalCost) : inputCost + outputCost;
  return round(value, 5);
};

export const formatCost = (cost: number): string => `${cost.toFixed(5)}$`;

export const formatCostIntl = (cost: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumSignificantDigits: 5,
  }).format(cost);

export const calculatePercentageChange = (original: number, compared: number): string =>
  round(((original - compared) / compared) * 100, 2).toFixed(2);

export const formatScoreValue = (value: number) => {
  if (value === 0) return "0";

  const absValue = Math.abs(value);
  if (absValue >= 100) return round(value).toString();
  if (absValue >= 1) return round(value, 2).toString();
  return value.toPrecision(3);
};

export const isValidScore = (value: unknown): value is number => isNumber(value) && !isNaN(value) && isFinite(value);

export const SCORE_COLORS = {
  red: [204, 51, 51] as RGBColor, // Pure, vivid red (poor scores)
  yellow: [245, 158, 11] as RGBColor, // amber-500 (average scores)
  green: [34, 197, 94] as RGBColor, // green-500 (good scores)
  gray: [243, 244, 246] as RGBColor, // gray-100 (fallback)
} as const;

const getColorByNormalizedValue = (normalized: number): RGBColor => {
  const { red, yellow, green } = SCORE_COLORS;

  if (normalized <= 0.5) {
    // Red to yellow transition (0 to 0.5)
    const factor = normalized * 2;
    return interpolateColor(red, yellow, factor);
  } else {
    // Yellow to green transition (0.5 to 1)
    const factor = (normalized - 0.5) * 2;
    return interpolateColor(yellow, green, factor);
  }
};

export const getScoreBackgroundColor = (min: number, max: number, value: number): RGBColor => {
  if (min === max) return SCORE_COLORS.gray;

  return flow((val: number) => normalizeValue(min, max, val), getColorByNormalizedValue)(value);
};

const hasSignificantRange = ({ min, max }: ScoreRange): boolean => {
  const range = max - min;
  const avgValue = mean([min, max]);

  return !(min === max || (avgValue !== 0 && Math.abs(range / avgValue) < 0.01) || Math.abs(range) < 0.001);
};

export const shouldShowHeatmap = (range: ScoreRange): boolean => hasSignificantRange(range);

export const createHeatmapStyle = (value: number, { min, max }: ScoreRange) => {
  if (!shouldShowHeatmap({ min, max })) {
    return {
      background: "transparent",
      color: "inherit",
    };
  }

  const bgColor = getScoreBackgroundColor(min, max, value);

  return {
    background: `rgb(${bgColor.join(", ")})`,
    color: getOptimalTextColor(bgColor),
  };
};
