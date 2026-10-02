import {positiveModulo} from '../micro-08/geometry';

export const STAGE = {width: 1280, height: 720};
export const CELL = 120;
export const AGENT = {x: STAGE.width / 2, y: STAGE.height / 2, radius: 60};
export const STREAM_PERIOD = 1200;

export const GRADIENTS = {
  green: ['#68ba92', '#1cac66'],
  blue: ['#6492d8', '#3d81eb'],
  pink: ['#f2b6dc', '#f694d2'],
} as const;

export type Micro11Controls = {
  streamerSpeed: number;
  loaderSpeed: number;
  streamSeed: number;
};

export const MICRO_11_DEFAULTS: Micro11Controls = {
  streamerSpeed: 420,
  loaderSpeed: 1.9,
  streamSeed: 209,
};

// One persistent world. The hero's cell surrounds the entire opening viewport.
// At the end, 2400 world units project to Figma's 100px pitch.
export const BIG_GRID = {pitch: 2400, finalPitch: 100, dotRadius: 6, columns: 15, rows: 9};
export const BIG_GRID_CELLS = Array.from({length: BIG_GRID.columns * BIG_GRID.rows}, (_, index) => {
  const column = index % BIG_GRID.columns - 7;
  const row = Math.floor(index / BIG_GRID.columns) - 4;
  return {id: `${row}:${column}`, x: column * BIG_GRID.pitch, y: row * BIG_GRID.pitch, hero: column === 0 && row === 0};
});
export type Micro11Transition = {smallGridFade: number; zoomOut: number; streamCollapse: number; loaderFade: number; dotDim: number};
export const INITIAL_TRANSITION: Micro11Transition = {smallGridFade: 0, zoomOut: 0, streamCollapse: 0, loaderFade: 0, dotDim: 0};
const clamp = (value: number) => Math.max(0, Math.min(1, value));

const streamOffset = (seed: number, index: number) => {
  let value = (Math.floor(seed) ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 2 ** 32 * STREAM_PERIOD;
};

export function sampleMicro11(time: number, controls: Micro11Controls = MICRO_11_DEFAULTS, transition: Micro11Transition = INITIAL_TRANSITION) {
  const zoom = clamp(transition.zoomOut);
  const scale = (BIG_GRID.finalPitch / BIG_GRID.pitch) ** zoom;
  // The agent AND its stream share the size correction needed to finish at
  // a 12px dot inside a 100px cell. Camera scaling alone would yield 5px.
  const screenRadius = AGENT.radius * (BIG_GRID.dotRadius / AGENT.radius) ** zoom;
  const contentScale = screenRadius / (scale * AGENT.radius);
  return {
    cells: BIG_GRID_CELLS.map((cell, index) => {
      const offset = streamOffset(controls.streamSeed, index);
      const phase = time * controls.streamerSpeed + offset;
      return {...cell, offset, streamPhase: positiveModulo(phase, STREAM_PERIOD), gridPhase: positiveModulo(phase, CELL)};
    }),
    streamPhase: positiveModulo(time * controls.streamerSpeed, STREAM_PERIOD),
    gridPhase: positiveModulo(time * controls.streamerSpeed, CELL),
    loaderAngle: positiveModulo(time * controls.loaderSpeed, 1) * 360,
    camera: {x: AGENT.x, y: AGENT.y, scale},
    contentScale,
    agentRadius: AGENT.radius * contentScale,
    smallGridOpacity: 1 - clamp(transition.smallGridFade),
    streamHeightScale: 1 - clamp(transition.streamCollapse),
    loaderOpacity: 1 - clamp(transition.loaderFade),
    dotColor: `rgb(${Array(3).fill(Math.round(255 + (78 - 255) * clamp(transition.dotDim))).join(', ')})`,
  };
}
