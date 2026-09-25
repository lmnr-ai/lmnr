export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const intervalProgress = (progress: number, start: number, end: number) =>
  clamp01((progress - start) / (end - start));

export const easeOutCubic = (progress: number) => 1 - Math.pow(1 - clamp01(progress), 3);
