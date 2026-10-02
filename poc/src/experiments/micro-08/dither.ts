import {FIGMA, positiveModulo} from './geometry';

export const DITHER_LOOP_SECONDS = 8;
export const DITHER_DEFAULTS = {
  pixelSize: 3,
  colorLevels: 8,
  contrast: 1.4,
  intensity: 1,
  pulse: 0,
};
export type DitherAppearance = typeof DITHER_DEFAULTS;
export type DitherState = Omit<DitherAppearance, 'pulse'>;
export const DITHER_UNIFORMS = ['pixelSize', 'colorLevels', 'contrast', 'intensity'] as const;

// Paper Shaders' Bayer8 matrix (Apache-2.0; attribution in vendor/paper).
export const BAYER_8 = [
  0,32,8,40,2,34,10,42, 48,16,56,24,50,18,58,26,
  12,44,4,36,14,46,6,38, 60,28,52,20,62,30,54,22,
  3,35,11,43,1,33,9,41, 51,19,59,27,49,17,57,25,
  15,47,7,39,13,45,5,37, 63,31,55,23,61,29,53,21,
] as const;

export function sameDither(a: DitherState, b: DitherState) {
  return DITHER_UNIFORMS.every(key => a[key] === b[key]);
}

export function ditherAtProgress(progress: number, appearance: DitherAppearance = DITHER_DEFAULTS): DitherState {
  const angle = positiveModulo(progress, 1) * Math.PI * 2;
  return {
    pixelSize: appearance.pixelSize,
    colorLevels: appearance.colorLevels,
    contrast: appearance.contrast,
    // Optional intensity pulse, never geometry distortion or a moving pixel grid.
    // Default pulse0 makes this a static filter: no shader work on transport ticks.
    intensity: appearance.intensity * (1 - appearance.pulse * .5 * (1 - Math.cos(angle))),
  };
}

export function sampleDither(time: number, appearance: DitherAppearance = DITHER_DEFAULTS) {
  return ditherAtProgress(positiveModulo(time, DITHER_LOOP_SECONDS) / DITHER_LOOP_SECONDS, appearance);
}

// Match the original SVG's xMidYMid slice (including its tiny aspect-ratio crop).
export function cloudImageRect(width: number, height: number) {
  const box = FIGMA.backgroundImage;
  const scale = Math.max(box.width / width, box.height / height);
  return {x: box.x + (box.width - width * scale) / 2,
    y: box.y + (box.height - height * scale) / 2, width: width * scale, height: height * scale};
}
