import {staticFile} from 'remotion';
import {CELLS, GRID, SCATTERED_WARNING} from './geometry';
export {SCATTERED_WARNING} from './geometry';

// Figma 4809:20588 / grid 4809:20589, row-major 15 × 9 cells.
// Keep this owned by Ultimate 2: do not decorate Animation 12's shared CELLS.
// These are authored placements, not randomness that changes on a seek/render.
const mutedCells = new Set([15, 16, 17, 23, 28, 33, 35, 38, 41, 47, 52, 65, 68, 72, 77, 79, 84, 92, 93, 97, 99, 111, 113, 118]);
const lighterCells = new Set([20, 25, 51, 58, 63, 70, 95, 101]);
const warningCells = new Set([18, 28, 38, 39, 47, 49, 52, 55, 57, 72, 79, 81, 85, 92, 99, 102, 111]);
export const SPOTTY_CELLS = CELLS.map(cell => ({...cell,
  fill: mutedCells.has(cell.id) ? '#1f1f1f' : lighterCells.has(cell.id) ? '#242424' : undefined,
  warning: !cell.hero && warningCells.has(cell.id),
}));

/** Occupants share the existing content-scale law (120px dot → 12px).
 * Warning sizes are Figma's final-pose dimensions, not screen-pinned overlays.
 * Cell fills share the macro lattice's camera transform and never cover borders. */
export const MacroGrid = ({contentScale}: {contentScale: number}) => {
  const width = SCATTERED_WARNING.width * 10 * contentScale;
  const height = SCATTERED_WARNING.height * 10 * contentScale;
  return <g data-micro17-macro-grid="">
    <g data-cell-fills="">
      {SPOTTY_CELLS.filter(cell => cell.fill).map(cell => <rect key={cell.id} data-cell-fill={cell.id}
        x={cell.x - GRID.pitch / 2} y={cell.y - GRID.pitch / 2} width={GRID.pitch} height={GRID.pitch} fill={cell.fill}/>)}
    </g>
    {SPOTTY_CELLS.map(cell => <g key={cell.id} data-grid-cell={cell.id} transform={`translate(${cell.x} ${cell.y})`}>
      <path d={`M${-GRID.pitch / 2} ${-GRID.pitch / 2}V${GRID.pitch / 2}H${GRID.pitch / 2}`} fill="none" stroke="#333" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
      {!cell.hero && (cell.warning
        ? <image data-scattered-warning={cell.id} href={staticFile(SCATTERED_WARNING.asset)} x={-width / 2} y={-height / 2} width={width} height={height}/>
        : <circle r={60 * contentScale} fill="#4e4e4e"/>)}
    </g>)}
  </g>;
};
