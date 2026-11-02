import { useMemo } from "react";

import { createAxisFormatter } from "@/lib/charts/time";

import { calculateDataMax } from "../utils";
import BarRow from "./bar-row";

interface HorizontalBarChartProps {
  data: Record<string, any>[];
  x: string;
  y: string;
  onBarClick?: (rowData: Record<string, any>) => void;
}

/** One bar per row, scaled to the largest value; plain HTML so long lists scroll inside the card. */
const HorizontalBarChart = ({ data, x, y, onBarClick }: HorizontalBarChartProps) => {
  const valueFormatter = useMemo(() => createAxisFormatter(data, x), [data, x]);
  const max = useMemo(() => calculateDataMax(data, [x]), [data, x]);

  return (
    <div className="no-scrollbar scroll-fade-y mt-1 grid min-h-0 flex-1 auto-rows-min grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 overflow-y-auto">
      {data.map((row, i) => (
        <BarRow
          key={i}
          category={y !== x ? String(row[y]) : ""}
          value={Number(row[x]) || 0}
          formattedValue={valueFormatter(row[x])}
          max={max}
          valueLabel={x}
          onClick={onBarClick && (row.trace_id || row.id) ? () => onBarClick(row) : undefined}
        />
      ))}
    </div>
  );
};

export default HorizontalBarChart;
