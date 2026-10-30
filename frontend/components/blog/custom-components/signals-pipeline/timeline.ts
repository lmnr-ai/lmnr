// Every stage has settled by here; playback stops and holds this frame.
// Reduced-motion users get this frame straight away.
export const END_TIME = 7;

export const BIT_FREQUENCY = 2.5;
export const BIT_TRAVEL = 0.6;

export interface ConnectorTiming {
  drawAt: number;
  drawDuration: number;
  emitStart: number;
  emitEnd: number;
}

// Each line starts once the node before it has grown; the next node grows as the line lands.
export const CONNECTORS = {
  agentToTraces: { drawAt: 0.5, drawDuration: 0.5, emitStart: 1.3, emitEnd: 3.5 },
  tracesToSignal: { drawAt: 2.6, drawDuration: 0.5, emitStart: 3.6, emitEnd: 4.8 },
  signalToEvents: { drawAt: 3.6, drawDuration: 0.5, emitStart: 4.4, emitEnd: 6.2 },
} satisfies Record<string, ConnectorTiming>;

export const GROW_DURATION = 0.45;

export const NODE_GROW_AT = {
  agent: 0,
  traces: 0.9,
  signal: 3,
  events: 4,
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

// Same curve as the landing system loop: cubic-bezier(0.22, 1, 0.36, 1) ≈ easeOutQuint.
const easeOut = (value: number) => 1 - Math.pow(1 - clamp01(value), 5);

export const stageProgress = (time: number, at: number, duration: number) => easeOut((time - at) / duration);

// Items fill in as the connector's bits land, from the first arrival to the last.
// Unclamped: keeps climbing past itemCount, for effects that outlive the last arrival.
const arrivalProgress = (time: number, timing: ConnectorTiming, itemCount: number) => {
  const firstArrival = timing.emitStart + BIT_TRAVEL;
  return (itemCount * Math.max(0, time - firstArrival)) / (timing.emitEnd - timing.emitStart);
};

export const arrivalCount = (time: number, timing: ConnectorTiming, itemCount: number) =>
  Math.min(itemCount, arrivalProgress(time, timing, itemCount));
