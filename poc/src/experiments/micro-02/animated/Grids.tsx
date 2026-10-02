export interface GridsProps {
  topLeftProgress: number;
  bottomRightProgress: number;
}

const GRID_SIZE = 8;
const CELL_COUNT = GRID_SIZE * GRID_SIZE;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const cellProgress = (progress: number, index: number) => {
  // Spend most of the clip walking the cells in row-major (Z-reading) order,
  // while overlapping each cell's growth enough to read as one continuous wave.
  const staggerPortion = 0.72;
  const start = (index / (CELL_COUNT - 1)) * staggerPortion;
  return clamp01((progress - start) / (1 - staggerPortion));
};

const Grid = ({className, progress}: {className: string; progress: number}) => (
  <div
    className={`micro02-grid ${className}`}
    style={{
      backgroundImage: 'none',
      display: 'grid',
      gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
      gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`,
    }}
  >
    {Array.from({length: CELL_COUNT}, (_, index) => {
      const growth = cellProgress(progress, index);
      return (
        <div
          key={index}
          aria-hidden="true"
          style={{position: 'relative', width: '100%', height: '100%'}}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              boxSizing: 'border-box',
              borderLeft: '2px solid rgb(255 255 255 / 0.12)',
              borderBottom: '2px solid rgb(255 255 255 / 0.12)',
              transform: `scale(${growth})`,
              transformOrigin: 'bottom left',
            }}
          />
        </div>
      );
    })}
  </div>
);

export const Grids = ({topLeftProgress, bottomRightProgress}: GridsProps) => (
  <>
    <Grid className="micro02-grid-top-left" progress={clamp01(topLeftProgress)} />
    <Grid className="micro02-grid-bottom-right" progress={clamp01(bottomRightProgress)} />
  </>
);
