import {positiveModulo} from '../micro-08/geometry';

export const STAGE = {width: 1280, height: 720};
export const CELL = 120;
export const AGENT = {x: 1011, y: 360, radius: 60};
export const CLOUD = {right: 1072, bottom: 335, width: 263, height: 263};
export const STREAM_PERIOD = 1200;
export const STREAM_SEGMENTS = Object.freeze([
  {name: 'Write', start: 0, width: 240},
  {name: 'Read', start: 240, width: 120},
  {name: 'Thinking', start: 360, width: 360},
  {name: 'Tool 1', start: 720, width: 120},
  {name: 'Bash', start: 840, width: 240},
  {name: 'Tool 2', start: 1080, width: 120},
]);

export const GRADIENTS = {
  green: ['#68ba92', '#1cac66'],
  blue: ['#6492d8', '#3d81eb'],
  pink: ['#f2b6dc', '#f694d2'],
} as const;

export type Micro10Controls = {
  streamerSpeed: number;
  loaderSpeed: number;
  squishPeriod: number;
  widthAmount: number;
  heightAmount: number;
  shrinkAmount: number;
  puffRandomSeed: number;
  puffLifetime: number;
  puffTravel: number;
  puffSize: number;
  puffEndScale: number;
  puffXOffset: number;
  puffYOffset: number;
  puffVerticalDrift: number;
  puffFadeStart: number;
  puffOpacity: number;
  puffBrightness: number;
};

export const MICRO_10_DEFAULTS: Micro10Controls = {
  streamerSpeed: 420,
  loaderSpeed: 1.9,
  squishPeriod: 0.7,
  widthAmount: 0.12,
  heightAmount: 0.05,
  shrinkAmount: 0.24,
  puffRandomSeed: 209,
  puffLifetime: 2.4,
  puffTravel: 600,
  puffSize: 156,
  puffEndScale: 0.18,
  puffXOffset: 120,
  puffYOffset: 0,
  puffVerticalDrift: -24,
  puffFadeStart: 0.45,
  puffOpacity: 0.64,
  puffBrightness: 0.9,
};

export type Micro10PuffTiming = {at: number; duration: number};
export const MICRO_10_PUFF_TIMING: Micro10PuffTiming = {at: .35, duration: .7};

const random01 = (seed: number, index: number) => {
  let value = (Math.floor(seed) ^ Math.imul(index, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 2 ** 32;
};

const steppedSquash = (time: number, period: number, offset = 0) => {
  const phase = positiveModulo(time + offset, period) / period;
  const steppedPhase = Math.floor(phase * 8) / 8;
  return Math.cos(steppedPhase * Math.PI * 2);
};

export function sampleMicro10(time: number, controls: Micro10Controls = MICRO_10_DEFAULTS, puffTiming: Micro10PuffTiming = MICRO_10_PUFF_TIMING) {
  const period = Math.max(0.1, controls.squishPeriod);
  const squash = steppedSquash(time, period);
  const widthScale = 1 - controls.widthAmount * squash;
  const heightScale = 1 + controls.heightAmount * squash;
  // Shrink only at minimum width. Scale returns to exactly 1 when width peaks.
  const uniformScale = 1 - controls.shrinkAmount * (squash + 1) / 2;
  const width = CLOUD.width * widthScale * uniformScale;
  const height = CLOUD.height * heightScale * uniformScale;
  const puffLifetime = Math.max(0.1, controls.puffLifetime);
  const puffInterval = Math.max(.01, puffTiming.duration);
  // The repeating DialKit bar owns both the first emission and interval.
  // Keep enough previous emissions alive for overlapping smoke trails.
  const latestEmissionIndex = Math.floor((time - puffTiming.at) / puffInterval + 1e-9);
  const latestEmission = puffTiming.at + latestEmissionIndex * puffInterval;
  const puffCount = Math.min(32, Math.ceil(puffLifetime / puffInterval) + 1);
  const sourceRight = CLOUD.right - CLOUD.width + controls.puffXOffset;
  const sourceTop = CLOUD.bottom - CLOUD.height + controls.puffYOffset;
  const puffs = Array.from({length: puffCount}, (_, index) => {
    const emissionIndex = latestEmissionIndex - index;
    const age = time - (latestEmission - index * puffInterval);
    const progress = age / puffLifetime;
    if (progress < 0 || progress >= 1) return null;
    const phaseOffset = random01(controls.puffRandomSeed, emissionIndex) * period;
    const puffSquash = steppedSquash(time, period, phaseOffset);
    const puffWidthScale = 1 - controls.widthAmount * puffSquash;
    const puffHeightScale = 1 + controls.heightAmount * puffSquash;
    const puffUniformScale = 1 - controls.shrinkAmount * (puffSquash + 1) / 2;
    const scale = 1 + (controls.puffEndScale - 1) * progress;
    const puffWidth = controls.puffSize * scale * puffWidthScale * puffUniformScale;
    const puffHeight = controls.puffSize * scale * puffHeightScale * puffUniformScale;
    const right = sourceRight - controls.puffTravel * progress;
    const fade = progress <= controls.puffFadeStart ? 1 : 1 - (progress - controls.puffFadeStart) / Math.max(0.001, 1 - controls.puffFadeStart);
    return {
      bounds: {x: right - puffWidth, y: sourceTop + controls.puffVerticalDrift * progress, width: puffWidth, height: puffHeight},
      opacity: controls.puffOpacity * Math.max(0, fade),
      progress,
      phaseOffset,
    };
  }).filter((puff): puff is NonNullable<typeof puff> => puff !== null);
  return {
    streamPhase: positiveModulo(time * controls.streamerSpeed, STREAM_PERIOD),
    gridPhase: positiveModulo(time * controls.streamerSpeed, CELL),
    loaderAngle: positiveModulo(time * controls.loaderSpeed, 1) * 360,
    cloudBounds: {x: CLOUD.right - width, y: CLOUD.bottom - height, width, height},
    puffs,
    puffBrightness: controls.puffBrightness,
  };
}
