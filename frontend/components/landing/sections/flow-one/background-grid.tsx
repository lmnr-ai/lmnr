import { GRID_CELL_SIZE, scaledWidth } from "./chart-geometry";

const BackgroundGrid = () => (
  <div
    aria-hidden
    className="pointer-events-none absolute right-0 top-0"
    style={{
      left: "var(--chart-left-gutter)",
      bottom: "var(--chart-bottom-row)",
      backgroundImage:
        "linear-gradient(to right, #282828 1px, transparent 1px), linear-gradient(to top, #282828 1px, transparent 1px)",
      backgroundPosition: "left bottom",
      backgroundSize: `${scaledWidth(GRID_CELL_SIZE)} ${scaledWidth(GRID_CELL_SIZE)}`,
    }}
  />
);

export default BackgroundGrid;
