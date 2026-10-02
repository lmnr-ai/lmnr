import {OUTRO_CELLS, OUTRO_TOPOLOGY} from './outro';
import {COLORS} from '../micro-14/geometry';
import {GRID as MACRO_GRID} from '../micro-17/geometry';
import {GRID_CELLS, HERO_CENTER} from './geometry';

/** Identical border paths in scan and postlude, including inward border-box ends. */
export const WorldGrid = ({cameraScale, extended = false}: {cameraScale: number; extended?: boolean}) => {
  const half = MACRO_GRID.pitch / 2, inset = .5 / cameraScale;
  return <g data-owned-grid aria-label={extended ? `${OUTRO_TOPOLOGY.columns} by ${OUTRO_TOPOLOGY.rows} centered grid` : '17 by 12 centered grid'}>
    {(extended ? OUTRO_CELLS.map(cell => ({...cell, cell: cell.index})) : GRID_CELLS).map(cell => <path key={cell.cell} data-grid-cell={cell.cell}
      transform={`translate(${(cell.x - HERO_CENTER.x) * MACRO_GRID.pitch / 78} ${(cell.y - HERO_CENTER.y) * MACRO_GRID.pitch / 78})`}
      d={`M${-half} ${-half + inset}V${half + inset}M${-half - inset} ${half}H${half - inset}`}
      fill="none" stroke={COLORS.grid} strokeWidth="1" vectorEffect="non-scaling-stroke"/>)}
  </g>;
};
