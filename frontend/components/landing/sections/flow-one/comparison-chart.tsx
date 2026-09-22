"use client";

import BackgroundGrid from "./background-grid";
import ChartGrid from "./chart-grid";
import ChartPoints from "./chart-points";

const ComparisonChart = () => (
  <div
    className="relative aspect-[55/24] w-full overflow-hidden bg-[#202021] [container-type:inline-size]"
    role="img"
    aria-label="Flow-1 model comparison using F1 score and cost for 16k-character traces"
  >
    <BackgroundGrid />
    <ChartGrid />
    <ChartPoints />
  </div>
);

export default ComparisonChart;
