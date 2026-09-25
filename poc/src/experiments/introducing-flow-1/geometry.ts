import {Easing, interpolate} from 'remotion';
import {GRID as SPARKLE_GRID} from '../micro-09/geometry';
import {sampleSparkleGrid, SPARKLE_DEFAULTS} from '../micro-09/sparkle';
import type {FlowPlayback} from './sample';

export const STAGE = {width: 1280, height: 720};
export const GRID = {pitch: 100, frame1Translation: {x: -110, y: 10}};
export const SETTLED_CAMERA_SCALE = .6;
export const DOT = {size: 12, cellLeft: 44.5, cellTop: 43.5};
export const BENCHMARKS = [
  {id: 'opus', percent: 89, percentLabel: '89.0%', count: 6, name: 'Opus-5', nameWidthScreen: 101, barScreen: 10},
  {id: 'sonnet', percent: 83.5, percentLabel: '83.5%', count: 9, name: 'Sonnet-5', nameWidthScreen: 135, barScreen: 27},
  {id: 'flow', percent: 81.9, percentLabel: '81.9%', count: 238, name: 'Flow-1', nameWidthScreen: 101, barScreen: 638},
  {id: 'sol', percent: 81, percentLabel: '81.0%', count: 6, name: 'GPT-5.6 Sol', nameWidthScreen: 185, barScreen: 10},
  {id: 'luna', percent: 80, percentLabel: '80.0%', count: 116, name: 'GPT-5.6 Luna', nameWidthScreen: 202, barScreen: 307},
  {id: 'gemini', percent: 69.9, percentLabel: '69.9%', count: 11, name: 'Gemini-3.8 Flash', nameWidthScreen: 269, barScreen: 40},
] as const;
export const BENCHMARK_HEADING_INSET = 24 / SETTLED_CAMERA_SCALE;
export const SCREEN_LINE_PITCH = 42.3848;
export const LINE_PITCH = SCREEN_LINE_PITCH / SETTLED_CAMERA_SCALE;
export const LINE_STRIP = {
  left: -53 / SETTLED_CAMERA_SCALE,
  top: -108 / SETTLED_CAMERA_SCALE,
  width: 196 / SETTLED_CAMERA_SCALE,
  height: 481.463 / SETTLED_CAMERA_SCALE,
  pathsPerTile: 9,
  tileCount: 3,
} as const;
// One extra 720px screen of travel places the benchmark below the title.
// At .6 scale that is 1200 world units: exactly twelve grid cells.
export const BENCHMARK_WORLD_X = -200;
export const BENCHMARK_WORLD_Y = 1700;
export const ENGINE_WORLD_X = 300;
export const ENGINE_WORLD_Y = 3600;
export const positiveMod = (n: number, period: number) => ((n % period) + period) % period;
export const settledWorldLength = (screenPixels: number) => screenPixels / SETTLED_CAMERA_SCALE;

export type CoverMotion = 'top' | 'right' | 'split';
export function coverGeometry(progress: number, motion: CoverMotion) {
  const size = 756.667 + 43.333 * progress;
  if (motion === 'top') return {
    ringX: 0,
    coverX: 21.6667 * (1 - progress),
    coverY: -753.333 + 753.333 * progress,
    size,
  };
  if (motion === 'right') {
    // The two circle centers remain symmetric around x=400 throughout.
    const halfSeparation = 387.5 * (1 - progress);
    return {
      ringX: -halfSeparation,
      coverX: 400 + halfSeparation - size / 2,
      coverY: (800 - size) / 2,
      size,
    };
  }
  const circleLeft = (800 - size) / 2;
  const half = size / 2;
  return {
    ringX: 0,
    coverX: circleLeft,
    coverY: circleLeft,
    size,
    leftDoorX: circleLeft - half * (1 - progress),
    rightDoorX: circleLeft + half + half * (1 - progress),
  };
}

// Same seed, clock, density and neighbor-weighted state changes as Animation 9.
// Only the selected glyph differs: blue dots instead of multicolored warnings.
export function sampleFlowDots(time: number) {
  return sampleSparkleGrid(time, 209, SPARKLE_DEFAULTS).map((cell, index) => ({
    row: Math.floor(index / SPARKLE_GRID.columns) - 1,
    column: index % SPARKLE_GRID.columns,
    colored: cell.kind === 'triangle',
    scale: cell.kind === 'triangle' ? 2 : 1,
  }));
}

export function benchmarkPercentLabel(id: typeof BENCHMARKS[number]['id'], percent: number, reveal: number) {
  return id === 'flow' ? `${(percent * reveal).toFixed(1)}%` : BENCHMARKS.find(row => row.id === id)!.percentLabel;
}

const modelRowEase = Easing.bezier(.45, 0, .55, 1);
export function staggeredRevealProgress(time: number, timing: {at: number; duration: number}, rowIndex: number, stagger: number) {
  const at = timing.at + Math.max(0, stagger) * Math.max(0, rowIndex);
  if (timing.duration <= 0) return Number(time >= at);
  return interpolate(time, [at, at + timing.duration], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: modelRowEase,
  });
}

export function introducingFlowState(playback: FlowPlayback) {
  const p = playback.progress;
  const zoom = p.cameraZoom;
  const scale = 1 + (SETTLED_CAMERA_SCALE - 1) * zoom;
  // Preserve the world point under the opening viewport center while zooming.
  // Section travel is then purely vertical; section X offsets retain Figma framing.
  const openingCenterWorld = {
    x: (STAGE.width / 2 - GRID.frame1Translation.x),
    y: (STAGE.height / 2 - GRID.frame1Translation.y),
  };
  const camera = {
    scale,
    // At settled 60px pitch, +30 selects the symmetric 40px/40px edge-cell
    // phase (rather than 10px/10px slivers) and aligns section x=100 to a line.
    x: STAGE.width / 2 - openingCenterWorld.x * scale + 30 * zoom,
    y: STAGE.height / 2 - openingCenterWorld.y * scale
      - 870 * p.cameraToBenchmark
      - 240 * p.cameraToAnalysis
      - 1080 * p.cameraToEngine,
  };
  const spinnerElapsed = Math.max(0, playback.time - playback.timing.engineSpinner.at);
  const linesElapsed = Math.max(0, playback.time - playback.timing.engineLines.at);
  const coverElapsed = Math.max(0, playback.time - playback.timing.coverSpinner.at);
  return {
    camera,
    cloudProgress: p.cloudReveal,
    cloudTranslateY: 900 * p.cloudExit,
    dotScale: 1 - p.dotsExit,
    benchmarkHeading: p.benchmarkHeading,
    modelRows: p.modelRows,
    modelRowsTiming: playback.timing.modelRows,
    percentageReveal: p.percentageReveal,
    percentageRevealTiming: playback.timing.percentageReveal,
    percentageCountUp: p.percentageCountUp,
    numberSwap: p.numberSwap,
    analysisCountUp: p.analysisCountUp,
    barsGrow: p.barsGrow,
    analysisHeading: p.analysisHeading,
    activation: p.moduleActivation,
    cover: p.coverDescent,
    coverTint: p.coverTint,
    spinnerElapsed,
    linesElapsed,
    coverElapsed,
    spinnerAngle: positiveMod(spinnerElapsed * 120, 360),
    lineOffset: positiveMod(linesElapsed * 48, LINE_PITCH),
    // coverSpinner owns both the clock start and one full rotation's interval.
    coverAngle: positiveMod(coverElapsed / Math.max(playback.timing.coverSpinner.duration, 1e-6) * 360, 360),
  };
}
export type IntroducingFlowState = ReturnType<typeof introducingFlowState>;
