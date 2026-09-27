export type EffectKind = 'pianoCue' | 'whoosh' | 'puff' | 'thock' | 'impact' | 'keyClick';

export type EffectTuning = {
  mix: {music: number; sfx: number; hall: number; room: number; delay: number};
  pianoCue: {volume: number; transpose: number; brightness: number; length: number; space: number};
  whoosh: {volume: number; duration: number; frequency: number; resonance: number; air: number; softness: number};
  puff: {volume: number; pitch: number; duration: number};
  thock: {volume: number; pitch: number; decay: number};
  impact: {volume: number; pitch: number; decay: number};
  keyClick: {volume: number; brightness: number; body: number; decay: number};
};

export type TuningControl = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: 'percent' | 'ratio' | 'semitones';
  help: string;
};

export type EffectPanel = {
  id: EffectKind;
  label: string;
  description: string;
  usedFor: string;
  controls: TuningControl[];
};

export const DEFAULT_EFFECT_TUNING: EffectTuning = {
  mix: {music: 1, sfx: 1, hall: 1, room: 1, delay: 1},
  pianoCue: {volume: 1, transpose: 0, brightness: 1, length: 1, space: 1},
  whoosh: {volume: 1, duration: 1, frequency: 1, resonance: 1, air: 1, softness: 0},
  puff: {volume: 1, pitch: 1, duration: 1},
  thock: {volume: 1, pitch: 1, decay: 1},
  impact: {volume: 1, pitch: 1, decay: 1},
  keyClick: {volume: 1, brightness: 1, body: 1, decay: 1},
};

const ratio = (key: string, label: string, min: number, max: number, help: string, step = .01): TuningControl => ({key, label, min, max, step, unit: 'ratio', help});
const percent = (key: string, label: string, min: number, max: number, help: string, step = .01): TuningControl => ({key, label, min, max, step, unit: 'percent', help});

export const EFFECT_PANELS: EffectPanel[] = [
  {
    id: 'pianoCue', label: 'Piano UI cues', description: 'Short piano notes that replace electronic beeps in the acoustic cut.',
    usedFor: 'agent entry, warnings, drawer latches, counters, badges, issue clusters, and the logo signature',
    controls: [
      percent('volume', 'Volume', 0, 2, 'How strongly UI notes sit above the score.'),
      {key: 'transpose', label: 'Pitch', min: -12, max: 12, step: 1, unit: 'semitones', help: 'Moves every UI cue up or down while preserving its melody.'},
      ratio('brightness', 'Brightness', .35, 1.8, 'Lower is felt and warm; higher reveals more hammer and upper harmonics.'),
      ratio('length', 'Ring length', .3, 2, 'How long each cue sustains.'),
      ratio('space', 'Room and hall', 0, 2, 'Scales the ambience sends without changing the dry note.'),
    ],
  },
  {
    id: 'whoosh', label: 'Movement air', description: 'Pink-noise breaths following camera moves, clouds, drawers, and transitions.',
    usedFor: 'stream start, camera moves, cloud handoffs, drawer motion, Flow reveal, issue travel, and logo arrival',
    controls: [
      percent('volume', 'Volume', 0, 2, 'Overall movement-air level.'),
      ratio('duration', 'Tail length', .35, 1.8, 'Shortens or stretches each breath without moving its start time.'),
      ratio('frequency', 'Tone', .45, 1.8, 'Moves the filter path lower for weight or higher for air.'),
      ratio('resonance', 'Focus', .45, 1.8, 'Controls how concentrated the filtered noise sounds.'),
      ratio('air', 'High air', 0, 2, 'Scales the lighter upper layer.'),
      percent('softness', 'Pillow softness', 0, 1, 'Replaces rough band-passed texture with smooth, drone-free filtered air.'),
    ],
  },
  {
    id: 'puff', label: 'Thinking puff', description: 'The soft breath when the first Thinking block appears.',
    usedFor: 'the first Thinking cloud in Ultimate 2',
    controls: [
      percent('volume', 'Volume', 0, 2, 'How audible the puff is.'),
      ratio('pitch', 'Tone', .5, 1.8, 'Lower is pillowy; higher is smaller and brighter.'),
      ratio('duration', 'Tail length', .35, 2, 'How quickly the breath disappears.'),
    ],
  },
  {
    id: 'thock', label: 'Closures and landings', description: 'Felt-and-wood impacts used when physical UI pieces stop.',
    usedFor: 'warning alerts, Thinking landing, Bash stop, Flow cover, and agent-window close',
    controls: [
      percent('volume', 'Volume', 0, 2, 'Overall landing strength.'),
      ratio('pitch', 'Body pitch', .55, 1.7, 'Lower is heavier; higher is smaller and tighter.'),
      ratio('decay', 'Decay', .35, 2, 'How long the wooden body rings.'),
    ],
  },
  {
    id: 'impact', label: 'Low reveals', description: 'Sub-heavy blooms underneath major scene reveals.',
    usedFor: 'Bash stop, Flow-1 reveal, and Laminar logo',
    controls: [
      percent('volume', 'Volume', 0, 2, 'Low-frequency reveal weight.'),
      ratio('pitch', 'Depth', .6, 1.5, 'Lower values make the impact deeper.'),
      ratio('decay', 'Bloom length', .35, 1.8, 'How long the low bloom hangs under the score.'),
    ],
  },
  {
    id: 'keyClick', label: 'Typing', description: 'Tiny mechanical keycaps with randomized tone and body.',
    usedFor: 'the coding-agent typing windows near the end',
    controls: [
      percent('volume', 'Volume', 0, 2, 'Overall typing level.'),
      ratio('brightness', 'Keycap tone', .45, 1.8, 'Lower is muted plastic; higher is crisp.'),
      ratio('body', 'Low body', 0, 2, 'Amount of the small low-frequency key body.'),
      ratio('decay', 'Click length', .4, 2, 'How quickly each key releases.'),
    ],
  },
];

export const MIX_CONTROLS: TuningControl[] = [
  percent('music', 'Piano score', 0, 1.5, 'The composed Arabesque music bus.'),
  percent('sfx', 'Sound effects', 0, 2, 'All dry effects together.'),
  percent('hall', 'Hall return', 0, 2, 'Long ambience shared by music and effects.'),
  percent('room', 'Room return', 0, 2, 'Short close reflections.'),
  percent('delay', 'Echo return', 0, 2, 'Triplet echoes in the soundtrack.'),
];

const clamp = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, numeric));
};

/** Accepts persisted/browser JSON without allowing missing, NaN, or extreme values into DSP. */
export function normalizeEffectTuning(input: unknown): EffectTuning {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const normalized = structuredClone(DEFAULT_EFFECT_TUNING);
  const groups: readonly (readonly [keyof EffectTuning, readonly TuningControl[]])[] = [['mix', MIX_CONTROLS], ...EFFECT_PANELS.map(panel => [panel.id, panel.controls] as const)];
  for (const [group, controls] of groups) {
    const values = source[group] && typeof source[group] === 'object' ? source[group] as Record<string, unknown> : {};
    for (const control of controls) {
      const fallback = (DEFAULT_EFFECT_TUNING[group] as Record<string, number>)[control.key];
      (normalized[group] as Record<string, number>)[control.key] = clamp(values[control.key], fallback, control.min, control.max);
    }
  }
  return normalized;
}
