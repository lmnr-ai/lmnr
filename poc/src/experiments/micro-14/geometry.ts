export const VIEWPORT = {width: 1280, height: 720} as const;
export const GRID = {columns: 18, rows: 12, cell: 78, x: -62, y: -71} as const;
export const CELL_COUNT = GRID.columns * GRID.rows;
export const COLORS = {background: '#1a1a1a', clusterBackground: '#1f1f1f', grid: '#333333', dot: '#4e4e4e'} as const;
export const SMALL_WARNING = {width: 25.41796875, height: 23.604496002197266} as const;
export const BORDER_WIDTH = 1;

// Figma's cells and clusters use border-box geometry with only an inward left
// and bottom border. Content is centered in the remaining inner rectangle.
export const borderBoxContentCenter = (x: number, y: number, width: number, height: number) => ({
  x: x + (BORDER_WIDTH + width) / 2,
  y: y + (height - BORDER_WIDTH) / 2,
});
export const inwardBorderRects = (x: number, y: number, width: number, height: number) => ({
  left: {x, y, width: BORDER_WIDTH, height},
  bottom: {x, y: y + height - BORDER_WIDTH, width, height: BORDER_WIDTH},
});

export type WarningColor = 'purple' | 'yellow' | 'blue' | 'salmon' | 'green' | 'pink';
export type Cluster = Readonly<{
  id: string; column: number; row: number; size: number; color: WarningColor;
  x: number; y: number; width: number; height: number;
  warningWidth: number; warningHeight: number;
}>;

export const CLUSTERS: readonly Cluster[] = Object.freeze([
  {id: 'pink-4', column: 5, row: 7, size: 4, color: 'pink', x: 328, y: 475, width: 312, height: 312, warningWidth: 77.08235168457031, warningHeight: 72},
  {id: 'purple-3', column: 2, row: 4, size: 3, color: 'purple', x: 94, y: 241, width: 234, height: 234, warningWidth: 67.44705963134766, warningHeight: 63},
  {id: 'blue-3', column: 15, row: 3, size: 3, color: 'blue', x: 1108, y: 163, width: 234, height: 234, warningWidth: 67.44705963134766, warningHeight: 63},
  {id: 'green-2', column: 13, row: 6, size: 2, color: 'green', x: 952, y: 397, width: 156, height: 156, warningWidth: 54, warningHeight: 50.14731216430664},
  {id: 'yellow-2', column: 5, row: 2, size: 2, color: 'yellow', x: 328, y: 85, width: 156, height: 156, warningWidth: 54, warningHeight: 50.14731216430664},
  {id: 'salmon-2', column: 9, row: 5, size: 2, color: 'salmon', x: 640, y: 319, width: 156, height: 156, warningWidth: 54, warningHeight: 50.14731216430664},
]);

export const SINGLETON = {column: 0, row: 1, color: 'purple' as WarningColor} as const;
export type Token = Readonly<{id: string; kind: 'dot' | 'warning'; color?: WarningColor; clusterId?: string}>;
export const cellIndex = (column: number, row: number) => row * GRID.columns + column;
export const cellCoordinates = (index: number) => ({column: index % GRID.columns, row: Math.floor(index / GRID.columns)});
export const cellCenter = (index: number) => {
  const {column, row} = cellCoordinates(index);
  return borderBoxContentCenter(GRID.x + column * GRID.cell, GRID.y + row * GRID.cell, GRID.cell, GRID.cell);
};

const warningAt = new Map<number, {color: WarningColor; clusterId?: string}>();
warningAt.set(cellIndex(SINGLETON.column, SINGLETON.row), {color: SINGLETON.color});
for (const cluster of CLUSTERS) {
  for (let row = cluster.row; row < cluster.row + cluster.size; row++) {
    for (let column = cluster.column; column < cluster.column + cluster.size; column++) {
      warningAt.set(cellIndex(column, row), {color: cluster.color, clusterId: cluster.id});
    }
  }
}

export const TOKENS: readonly Token[] = Object.freeze(Array.from({length: CELL_COUNT}, (_, index) => {
  const warning = warningAt.get(index);
  return Object.freeze(warning
    ? {id: `cell-${index}`, kind: 'warning' as const, ...warning}
    : {id: `cell-${index}`, kind: 'dot' as const});
}));
export const INTERMEDIATE_STATE: readonly string[] = Object.freeze(TOKENS.map(token => token.id));
export const TOKEN_BY_ID: ReadonlyMap<string, Token> = new Map(TOKENS.map(token => [token.id, token]));
export const GROUPED_WARNING_COUNT = CLUSTERS.reduce((total, cluster) => total + cluster.size ** 2, 0);
