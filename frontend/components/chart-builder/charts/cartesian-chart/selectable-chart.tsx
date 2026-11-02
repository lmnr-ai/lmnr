import ChartView, { type ChartViewProps } from "./chart-view";
import { useDragSelection } from "./use-drag-selection";

/** A chart that writes drags into the dashboard selection store, which only dashboards provide. */
const SelectableChart = ({ chartId, ...props }: Omit<ChartViewProps, "selection"> & { chartId: string }) => {
  const selection = useDragSelection(chartId);
  return <ChartView {...props} selection={selection} />;
};

export default SelectableChart;
