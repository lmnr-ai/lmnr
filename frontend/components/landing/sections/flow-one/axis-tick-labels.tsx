import {
  descF1ToY,
  plotPercentX,
  plotPercentY,
  scaledWidth,
  scaledWidthAtLeast,
  tracesPerDollarToX,
} from "./chart-geometry";

const X_TICKS = [0, 200, 400, 600, 800];
const Y_TICKS = [65, 70, 75, 80];

const AxisTickLabels = () => (
  <div aria-hidden className="font-sans-landing pointer-events-none absolute inset-0 text-[#7c7e85]">
    <div className="absolute right-0 top-0 bottom-0 left-[var(--chart-left-gutter)]">
      {X_TICKS.map((tick, index) => (
        <span
          key={tick}
          className={`absolute whitespace-nowrap ${
            index === 0 ? "" : index === X_TICKS.length - 1 ? "-translate-x-full" : "-translate-x-1/2"
          }`}
          style={{
            fontSize: scaledWidthAtLeast(10, 8),
            left: plotPercentX(tracesPerDollarToX(tick)),
            lineHeight: "normal",
            top: `calc(100% - var(--chart-bottom-row) + ${scaledWidth(5)})`,
          }}
        >
          {tick.toLocaleString()}
        </span>
      ))}
    </div>
    <div className="absolute inset-x-0 top-0 bottom-[var(--chart-bottom-row)]">
      {Y_TICKS.map((tick) => (
        <span
          key={tick}
          className="absolute -translate-x-full -translate-y-1/2 whitespace-nowrap"
          style={{
            fontSize: scaledWidthAtLeast(10, 8),
            left: `calc(var(--chart-left-gutter) - ${scaledWidth(5)})`,
            lineHeight: "normal",
            top: plotPercentY(descF1ToY(tick)),
          }}
        >
          {tick}
        </span>
      ))}
    </div>
  </div>
);

export default AxisTickLabels;
