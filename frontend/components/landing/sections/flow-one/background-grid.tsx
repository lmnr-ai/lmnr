import { FIRST_COLUMN_WIDTH, GRID_CELL_SIZE, LAST_ROW_HEIGHT, percentX, percentY, scaledWidth } from "./chart-geometry";

const BackgroundGrid = () => (
  <div
    aria-hidden
    className="pointer-events-none absolute right-0 top-0"
    style={{
      left: percentX(FIRST_COLUMN_WIDTH),
      bottom: percentY(LAST_ROW_HEIGHT),
      backgroundImage:
        "linear-gradient(to right, #282828 1px, transparent 1px), linear-gradient(to top, #282828 1px, transparent 1px)",
      backgroundPosition: "left bottom",
      backgroundSize: `${scaledWidth(GRID_CELL_SIZE)} ${scaledWidth(GRID_CELL_SIZE)}`,
    }}
  />
);

export default BackgroundGrid;
