import { cn } from "@/lib/utils";

import { formatMetricValue } from "./format-value";

/** Always occupies the header slot so toggling Show total doesn't resize the chart. */
const ChartTotal = ({ value, metricColumn, visible }: { value: number; metricColumn?: string; visible: boolean }) => (
  <span aria-hidden={!visible} className={cn("mb-2 min-h-fit truncate font-medium text-2xl", !visible && "invisible")}>
    {formatMetricValue(value, metricColumn)}
  </span>
);

export default ChartTotal;
