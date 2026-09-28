"use client";

import BackgroundGrid from "./background-grid";
import ChartGrid from "./chart-grid";
import ChartPoints from "./chart-points";

const ComparisonChart = () => (
  <div
    className="relative aspect-[55/24] w-full overflow-hidden bg-[#202021] [container-type:inline-size]"
    role="img"
    aria-label="flow-1 model comparison using trace analysis intelligence and median cost per trace"
  >
    <BackgroundGrid />
    <ChartGrid />
    <ChartPoints />
  </div>
);

export default ComparisonChart;
