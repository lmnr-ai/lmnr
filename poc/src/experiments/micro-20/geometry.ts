import {borderBoxContentCenter, cellCenter, cellCoordinates, CLUSTERS, GRID as SOURCE_GRID} from '../micro-14/geometry';
import type {Micro15Sample} from '../micro-15/sample';

/** Source IDs stay stable; source column 0 warnings remain off-canvas at -1. */
export const GRID = {columns: 17, rows: 12, cell: 78, x: -23.5, y: -68.5} as const;
export const HERO_CELL = 99; // Source (9,5) → owned (8,5); never a warning start.
export const HERO_CENTER = {x: 640, y: 360} as const;
export const ISSUE_WORLD_TRANSLATION = {x: GRID.x - SOURCE_GRID.x - GRID.cell, y: GRID.y - SOURCE_GRID.y} as const;
export const mapIssuePoint = <T extends {x: number; y: number}>(point: T): T => ({
  ...point, x: point.x + ISSUE_WORLD_TRANSLATION.x, y: point.y + ISSUE_WORLD_TRANSLATION.y,
});
export const mappedCellCenter = (cell: number) => mapIssuePoint(cellCenter(cell));
export const GRID_CELLS = Array.from({length: GRID.columns * GRID.rows}, (_, index) => {
  const column = index % GRID.columns, row = Math.floor(index / GRID.columns);
  return {cell: row * SOURCE_GRID.columns + column + 1, column, row,
    ...borderBoxContentCenter(GRID.x + column * GRID.cell, GRID.y + row * GRID.cell, GRID.cell, GRID.cell)};
});
export const isGridCell = (cell: number) => cellCoordinates(cell).column !== 0;
/** This projection and the renderer use the SAME constant world translation.
 * Source15 remains responsible for trajectories, merges and screen-space UI. */
export function mapIssueWorld(source: Micro15Sample) {
  return {
    translation: ISSUE_WORLD_TRANSLATION,
    groundDots: source.groundDots.filter(dot => isGridCell(dot.cell)).map(mapIssuePoint),
    warnings: source.tokens.filter(({token}) => token.kind === 'warning').map(mapIssuePoint),
    clusters: CLUSTERS.map(cluster => ({...mapIssuePoint(cluster), column: cluster.column - 1})),
  };
}
