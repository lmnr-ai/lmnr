import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {MICRO_23_KEYS, MICRO_23_TIMELINE, normalizeMicro23Controls, type Micro23Key, type Micro23Props} from './timeline';

// User-approved presentation values for traces <100k, Flow-1 at 4k output.
// Keep the conservative 20x headline and approved narration unchanged.
export const PRICING = {gpt: 38, flow: 888} as const;
export const FIELD = {x: 220, y: 150, columns: 43, rows: 21, cell: 20, orangeDots: PRICING.gpt} as const;
export const TOTAL_DOTS = PRICING.flow;
export const LAST_ROW_DOTS = TOTAL_DOTS % FIELD.columns || FIELD.columns;
// Whole-cell travel preserves the opening grid phase. The taller field needs
// 32 rows to clear its lower cards even at the minimum 20px opening cell size.
export const RETURN_GRID_DISTANCE = FIELD.cell * 32;
export const HEADLINE_BOUNDS = {x: 340, y: 290, width: 600, height: 140} as const;
/** All rectangles span whole cells, including the lower row at the field's edge. */
export const LABEL_BOUNDS = {
  gpt: {x: FIELD.x, y: FIELD.y - 40, width: 180, height: 40},
  flow: {x: FIELD.x, y: FIELD.y + FIELD.rows * FIELD.cell, width: 180, height: 40},
};
export const NUMBER_BOUNDS = {
  gpt: {x: FIELD.x + PRICING.gpt * FIELD.cell - 100, y: LABEL_BOUNDS.gpt.y, width: 100, height: 40},
  flow: {x: FIELD.x + LAST_ROW_DOTS * FIELD.cell - 320, y: LABEL_BOUNDS.flow.y, width: 320, height: 40},
};
// Twenty full rows of 43, then 28 left-aligned dots: no side extensions.
// Keep cell alignment; an odd column count centers on the nearest grid cell.
// Orange is a subset of Flow's total, not additional dots.
export const DOTS = Array.from({length: TOTAL_DOTS}, (_, index) => ({
  index, row: Math.floor(index / FIELD.columns), column: index % FIELD.columns,
  x: FIELD.x + (index % FIELD.columns + .5) * FIELD.cell,
  y: FIELD.y + (Math.floor(index / FIELD.columns) + .5) * FIELD.cell,
  color: index < FIELD.orangeDots ? 'orange' as const : 'blue' as const,
  order: index < FIELD.orangeDots ? index : index - FIELD.orangeDots,
}));
export const clamp01 = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/** Row-major (Z), never serpentine. Duration includes every dot's settling tail. */
export function staggerProgress(progress: number, index: number, count: number, dotDuration: number, totalDuration: number) {
  // The group bar owns the total span. If it is shorter than one entrance,
  // shorten the entrance to fit rather than extending beyond the bar.
  const p = clamp01(progress), window = Math.max(Number.EPSILON, Math.min(1, dotDuration / Math.max(Number.EPSILON, totalDuration)));
  if (p === 0 || p === 1) return p;
  const start = count <= 1 ? 0 : index / (count - 1) * (1 - window);
  const local = clamp01((p - start) / window);
  return 1 - (1 - local) ** 3;
}

const parsed = parseTimelineConfig(MICRO_23_TIMELINE);
export function createMicro23Sampler(props: Micro23Props = {}) {
  const controls = normalizeMicro23Controls(props.controls);
  const {clips} = computeStaticTimeline(parsed, props.values ?? {});
  const endpoint = Math.max(0, ...clips.map(clip => clip.at + clip.duration));
  const starts = Object.fromEntries(clips.map(clip => [clip.key, clip.at])) as Record<Micro23Key, number>;
  const durations = Object.fromEntries(clips.map(clip => [clip.key, clip.duration])) as Record<Micro23Key, number>;
  // Include the exact settled frame, even when hold is zero. Ignore floating-
  // point noise at whole-frame boundaries (e.g. 5.61 + .69 + 2 seconds).
  const durationInFrames = Math.ceil((endpoint + controls.hold) * 30 - 1e-9) + 1;
  return {
    clips, controls, durationInFrames, duration: durationInFrames / 30,
    sample(requestedTime: number) {
      const time = Number.isFinite(requestedTime) ? Math.max(0, requestedTime) : 0;
      const progress = Object.fromEntries(clips.map(clip => [clip.key,
        clamp01((computeClipState(clip, time, time).current as {progress: number}).progress),
      ])) as Record<Micro23Key, number>;
      return sampleMicro23Progress(time, progress, controls, starts, durations);
    },
  };
}
export type Micro23Sample = ReturnType<ReturnType<typeof createMicro23Sampler>['sample']>;

/** Shared geometry renderer seam: embedded timelines supply their native clip
 * values here, while Animation 23 continues to use its own static sampler. */
export function sampleMicro23Progress(time: number, progress: Record<Micro23Key, number>, controls = normalizeMicro23Controls(), starts: Record<Micro23Key, number> = Object.fromEntries(MICRO_23_KEYS.map(key => [key, MICRO_23_TIMELINE[key].at])) as Record<Micro23Key, number>, durations: Record<Micro23Key, number> = Object.fromEntries(MICRO_23_KEYS.map(key => [key, MICRO_23_TIMELINE[key].duration])) as Record<Micro23Key, number>) {
  const p = Object.fromEntries(MICRO_23_KEYS.map(key => [key, clamp01(progress[key])])) as Record<Micro23Key, number>;
  const zoomOutCell = controls.startCellSize + (controls.endCellSize - controls.startCellSize) * p.gridShrink;
  const cellSize = zoomOutCell + (controls.startCellSize - zoomOutCell) * p.returnToGrid;
  const centerY = 360 - 10 * p.gridShrink * (1 - p.returnToGrid);
  const gridY = centerY - RETURN_GRID_DISTANCE * p.returnToGrid * cellSize / FIELD.cell;
  return {time, progress: p, cellSize, gridY, worldScale: cellSize / FIELD.cell,
    headlineContainerVisible: time >= starts.headlineReveal,
    headlineSlideOutProgress: p.headlineFadeOut,
    numberContainersVisible: {gpt: time >= starts.gptNumber, flow: time >= starts.flowNumber},
    dots: DOTS.map(dot => ({...dot, progress: staggerProgress(p[dot.color === 'orange' ? 'orangeDots' : 'blueDots'], dot.order,
      dot.color === 'orange' ? FIELD.orangeDots : TOTAL_DOTS - FIELD.orangeDots, controls.dotDuration, durations[dot.color === 'orange' ? 'orangeDots' : 'blueDots'])})),
    dotDurations: {orange: Math.min(controls.dotDuration, durations.orangeDots), blue: Math.min(controls.dotDuration, durations.blueDots)},
    numbers: {gpt: Math.round(PRICING.gpt * p.gptNumber), flow: Math.round(PRICING.flow * p.flowNumber)},
  };
}
export const micro23DurationFrames = (props: Micro23Props = {}) => createMicro23Sampler(props).durationInFrames;
export function inspectionTime(search: string): number | null {
  const params = new URLSearchParams(search), raw = params.get('time');
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
// Keep individually editable tracks rather than one baked animation clock.
export const MICRO_23_TRACK_COUNT = MICRO_23_KEYS.length;
