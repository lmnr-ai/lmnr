import { formatMetricValue } from "./format-value";

const ChartTotal = ({ value, metricColumn }: { value: number; metricColumn?: string }) => (
  <span className="mb-2 min-h-fit shrink-0 truncate pl-1 text-2xl font-medium">
    {formatMetricValue(value, metricColumn)}
  </span>
);

export default ChartTotal;
