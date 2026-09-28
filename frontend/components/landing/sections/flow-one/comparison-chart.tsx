"use client";

import BackgroundGrid from "./background-grid";
import ChartGrid from "./chart-grid";
import ChartPoints from "./chart-points";

const ComparisonChart = () => (
  <div
    className="relative aspect-square w-full overflow-hidden bg-[#202021] [--chart-bottom-row:13.5%] [--chart-left-gutter:13.5%] [container-type:inline-size] sm:aspect-[55/24] sm:[--chart-bottom-row:14.0625%] sm:[--chart-left-gutter:6.136%]"
    role="img"
    aria-label="flow-1 model comparison using trace analysis intelligence and median cost per trace"
  >
    <BackgroundGrid />
    <ChartGrid />
    <ChartPoints />
  </div>
);

export default ComparisonChart;
