import {
  CHART_HEIGHT,
  FIRST_COLUMN_WIDTH,
  intelligenceToY,
  LAST_ROW_HEIGHT,
  percentX,
  percentY,
  scaledWidth,
  tracesPerDollarToX,
} from "./chart-geometry";

const X_TICKS = [0, 50, 100, 150, 200, 250];
const Y_TICKS = [65, 70, 75, 80, 85, 90, 95];

const AxisTickLabels = () => (
  <div aria-hidden className="font-sans-landing pointer-events-none absolute inset-0 text-[#7c7e85]">
    {X_TICKS.map((tick, index) => (
      <span
        key={tick}
        className={`absolute whitespace-nowrap ${
          index === 0 ? "" : index === X_TICKS.length - 1 ? "-translate-x-full" : "-translate-x-1/2"
        }`}
        style={{
          fontSize: scaledWidth(10),
          left: percentX(tracesPerDollarToX(tick)),
          lineHeight: "normal",
          top: percentY(CHART_HEIGHT - LAST_ROW_HEIGHT + 5),
        }}
      >
        {tick}
      </span>
    ))}
    {Y_TICKS.map((tick) => (
      <span
        key={tick}
        className="absolute -translate-x-full -translate-y-1/2 whitespace-nowrap"
        style={{
          fontSize: scaledWidth(10),
          left: percentX(FIRST_COLUMN_WIDTH - 5),
          lineHeight: "normal",
          top: percentY(intelligenceToY(tick)),
        }}
      >
        {tick}
      </span>
    ))}
  </div>
);

export default AxisTickLabels;
