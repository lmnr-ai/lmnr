import { easeOut } from "./easing";

export interface Stage {
  at: number;
  duration: number;
}

export const SPIN_PERIOD = 1.2;
export const BOX_FADE_DURATION = 0.3;

export const CONNECTIONS = {
  agentToTraces: { at: 0.45, duration: 0.8 },
  tracesToFlow: { at: 2.25, duration: 0.8 },
  flowToIssues: { at: 3.45, duration: 0.4 },
  issuesToEvals: { at: 4.95, duration: 0.75 },
  evalsToFix: { at: 6.8, duration: 0.55 },
  fixToAgent: { at: 8.35, duration: 0.6 },
  agentToEvals: { at: 8.95, duration: 0.85 },
} satisfies Record<string, Stage>;

export type ConnectionKey = keyof typeof CONNECTIONS;

export const NODE_ENTER = {
  agent: { at: 0, duration: 0.45 },
  flow: { at: 3.05, duration: 0.4 },
  fix: { at: 7.35, duration: 0.4 },
} satisfies Record<string, Stage>;

// Each box fades in at `at` and fills its cells over `duration`.
export const BOX_POPULATE = {
  traces: { at: 1.25, duration: 1.0 },
  issues: { at: 3.85, duration: 1.1 },
  evals: { at: 5.7, duration: 1.1 },
} satisfies Record<string, Stage>;

export const LABEL_FADE = {
  development: { at: 9.8, duration: 0.35 },
  production: { at: 10.2, duration: 0.35 },
} satisfies Record<string, Stage>;

// Once the last road is drawn, every road carries bits continuously.
export const AMBIENT_START = CONNECTIONS.agentToEvals.at + CONNECTIONS.agentToEvals.duration;

// Reduced-motion users get this settled frame without playback.
export const SETTLED_TIME = LABEL_FADE.production.at + LABEL_FADE.production.duration;

export const stageProgress = (time: number, { at, duration }: Stage, ease: (x: number) => number = easeOut) =>
  ease(Math.max(0, Math.min(1, (time - at) / duration)));

export const spinRotation = (time: number, { at }: Stage) =>
  time < at ? 0 : (((time - at) % SPIN_PERIOD) / SPIN_PERIOD) * 360;
