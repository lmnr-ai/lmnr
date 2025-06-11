import { clamp, flow } from "lodash";

export type RGBColor = [number, number, number];
export type ScoreRange = { min: number; max: number };

/**
 * Interpolates between two RGB colors using a factor
 */
export const interpolateColor = (color1: RGBColor, color2: RGBColor, factor: number): RGBColor => {
  const clampedFactor = clamp(factor, 0, 1);
  return color1.map((c1, index) => {
    const c2 = color2[index];
    return Math.round(c1 + (c2 - c1) * clampedFactor);
  }) as RGBColor;
};

/**
 * Converts RGB component to linear color space
 */
const toLinearColorSpace = (component: number): number => {
  const normalized = component / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
};

/**
 * Calculates the relative luminance of an RGB color
 */
export const getLuminance = ([r, g, b]: RGBColor): number => {
  const [linearR, linearG, linearB] = [r, g, b].map(toLinearColorSpace);
  return 0.2126 * linearR + 0.7152 * linearG + 0.0722 * linearB;
};

/**
 * Determines optimal text color based on background luminance
 */
export const getOptimalTextColor = flow(getLuminance, (luminance: number) => (luminance < 0.5 ? "white" : "black"));

/**
 * Normalizes a value within a range to 0-1
 */
export const normalizeValue = (min: number, max: number, value: number): number => {
  if (min === max) return 0;
  return clamp((value - min) / (max - min), 0, 1);
};
