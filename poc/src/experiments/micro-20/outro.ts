import {sampleSparkleGrid, SPARKLE_DEFAULTS, WARNING_ASSETS, type SparkleCell} from '../micro-09/sparkle';
import {CLUSTERS, type WarningColor} from '../micro-14/geometry';
import type {Micro15Sample} from '../micro-15/sample';
import {GRID_CELLS, mapIssuePoint} from './geometry';
import {evaluateClip, unit, type ClipTiming} from './timeline';

export const OUTRO_TEXT = 'Unlock the insights hiding in millions of agent traces';
export const OUTRO_TOPOLOGY = {columns: 49, rows: 30};
const colors: WarningColor[] = ['yellow', 'purple', 'green', 'salmon', 'pink', 'blue'];
// Overscan exceeds the 3200 × 1800 world viewport at the final .4 scale.
export const OUTRO_CELLS = Array.from({length: OUTRO_TOPOLOGY.columns * OUTRO_TOPOLOGY.rows}, (_, index) => {
  const column = index % OUTRO_TOPOLOGY.columns - 16, row = Math.floor(index / OUTRO_TOPOLOGY.columns) - 9;
  const owned = GRID_CELLS.find(cell => cell.column === column && cell.row === row);
  return {index, column, row, cell: owned?.cell, x: 16 + column * 78, y: -30 + row * 78,
    covered: CLUSTERS.some(cluster => column >= cluster.column - 1 && column < cluster.column - 1 + cluster.size && row >= cluster.row && row < cluster.row + cluster.size)};
});

/** The terminal source pose stays rendered, not reconstructed or crossfaded.
 * The real Animation9 automaton evolves its free cells; merged covers remain
 * occupants of this same camera/world and mask their constituent cells. */
export function sampleIssueOutro(source: Micro15Sample, timeInput: number, clip: ClipTiming = {at: 0, duration: 2}) {
  const time = Number.isFinite(timeInput) ? Math.max(0, timeInput) : 0;
  const elapsed = Math.round(Math.max(0, time - clip.at) * 1e9) / 1e9;
  const initial = sampleSparkleGrid(0, 209, SPARKLE_DEFAULTS, {topology: OUTRO_TOPOLOGY});
  const warnings = source.tokens.filter(value => value.token.kind === 'warning').map(value => ({...mapIssuePoint(value), color: value.token.color!}));
  for (const cell of OUTRO_CELLS) {
    if (cell.cell === undefined) continue;
    const warning = warnings.find(value => Math.abs(value.x - cell.x) < 1 && Math.abs(value.y - cell.y) < 1);
    initial[cell.index] = warning ? {kind: 'triangle', asset: WARNING_ASSETS[colors.indexOf(warning.color)]} : {kind: 'dot'};
  }
  const cells = sampleSparkleGrid(elapsed, 209, SPARKLE_DEFAULTS, {topology: OUTRO_TOPOLOGY, cells: initial});
  const changed = (index: number) => {
    const cell = cells[index], start = initial[index];
    return cell.kind !== start.kind || (cell.kind === 'triangle' && start.kind === 'triangle' && cell.asset !== start.asset);
  };
  const overlays = OUTRO_CELLS.filter(cell => !cell.covered && (cell.cell === undefined || changed(cell.index)))
    .map(cell => ({...cell, state: cells[cell.index]}));
  const replaced = new Set(overlays.flatMap(cell => cell.cell === undefined ? [] : [cell.cell]));
  const issue = replaced.size === 0 ? source : {...source,
    groundDots: source.groundDots.map(dot => replaced.has(dot.cell) ? {...dot, scale: 0} : dot),
    tokens: source.tokens.filter(value => !replaced.has(Number(value.token.id.replace('cell-', '')))),
  };
  const authored = {...clip, from: clip.from ?? {progress: 0}, to: clip.to ?? {progress: 1},
    transition: clip.transition ?? {type: 'easing' as const, duration: clip.duration, ease: [.45, 0, .55, 1] as [number, number, number, number]}};
  return {time, elapsed, scale: 1 - .6 * unit(evaluateClip(authored, time)), issue, overlays, cells: cells as readonly SparkleCell[]};
}
export type IssueOutroSample = ReturnType<typeof sampleIssueOutro>;
