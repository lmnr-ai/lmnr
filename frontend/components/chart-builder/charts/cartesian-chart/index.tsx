import ChartView, { type ChartViewProps } from "./chart-view";
import SelectableChart from "./selectable-chart";

type CartesianChartProps = Omit<ChartViewProps, "selection"> & {
  /** Set on dashboards, where dragging selects a time range; the editor and builder have no selection store. */
  selectionChartId?: string;
};

/** Line and stacked bar charts, drawn with TanStack Charts. */
const CartesianChart = ({ selectionChartId, ...props }: CartesianChartProps) =>
  selectionChartId ? <SelectableChart {...props} chartId={selectionChartId} /> : <ChartView {...props} />;

export default CartesianChart;
