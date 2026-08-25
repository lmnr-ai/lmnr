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

// A general categorical color palette: 100 colors sampled at equal intervals
// from a piecewise-linear curve through the original 17-color signal palette in
// HSL space (a closed loop red → ... → rose → red), so neighbouring indices are
// neighbouring hues. Shared by chart series and signal-cluster coloring.
export const CATEGORICAL_COLOR_PALETTE = [
  "#ef4444",
  "#f0493c",
  "#f24f35",
  "#f4572d",
  "#f55f25",
  "#f7691d",
  "#f97416",
  "#f87b14",
  "#f88212",
  "#f78910",
  "#f6910e",
  "#f6980c",
  "#f59f0a",
  "#f3a30a",
  "#f1a609",
  "#efaa09",
  "#edad09",
  "#ebb108",
  "#e8ba09",
  "#e3ce0b",
  "#dbde0e",
  "#c0d910",
  "#a7d413",
  "#90cf15",
  "#76cb17",
  "#59ca19",
  "#3dc91b",
  "#22c81d",
  "#1fc736",
  "#21c652",
  "#20c461",
  "#1dc267",
  "#1ac06d",
  "#17be73",
  "#14bc79",
  "#11ba7f",
  "#10b986",
  "#11b98c",
  "#12b992",
  "#13b899",
  "#13b89f",
  "#14b8a5",
  "#12bcaf",
  "#10c0bb",
  "#0ec3c5",
  "#0bbfca",
  "#09bbcf",
  "#06b6d4",
  "#07b4d7",
  "#08b1db",
  "#0aaedf",
  "#0babe2",
  "#0da8e6",
  "#0ea5ea",
  "#109ff1",
  "#1997f2",
  "#2291f3",
  "#2b8bf4",
  "#3486f5",
  "#3c81f6",
  "#437af5",
  "#4a74f4",
  "#516ff3",
  "#586bf2",
  "#5e68f1",
  "#6363f1",
  "#6961f2",
  "#7060f3",
  "#775ff4",
  "#7f5ef5",
  "#865df5",
  "#8d5cf6",
  "#925af6",
  "#9659f6",
  "#9b58f7",
  "#a057f7",
  "#a656f7",
  "#ac54f6",
  "#b451f5",
  "#bd4ef4",
  "#c54cf2",
  "#cd49f1",
  "#d647f0",
  "#e546ef",
  "#ee47e6",
  "#ee47d4",
  "#ed47c1",
  "#ed48af",
  "#ec489d",
  "#ed4792",
  "#ee4588",
  "#f0447f",
  "#f14275",
  "#f2416a",
  "#f43f5f",
  "#f3405a",
  "#f24155",
  "#f24151",
  "#f1424c",
  "#f04348",
];

// `count` maximally-separated colors: a golden-ratio walk lands successive
// entries ~137.5° apart around the palette's hue loop. Zip the result against a
// stably-ordered series list — position is what picks the color.
const GOLDEN_RATIO_CONJUGATE = 0.618033988749895;
// The palette loop starts at red. Enter it at blue instead, so a lone series
// reads as data rather than as an error.
const START_HUE_DEGREES = 218;
export const spacedPalette = (count: number, palette: readonly string[] = CATEGORICAL_COLOR_PALETTE): string[] =>
  Array.from(
    { length: count },
    (_, i) => palette[Math.floor(((i * GOLDEN_RATIO_CONJUGATE + START_HUE_DEGREES / 360) % 1) * palette.length)]
  );
