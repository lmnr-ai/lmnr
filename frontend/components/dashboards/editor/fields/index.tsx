import { ChartType } from "@/components/chart-builder/types";
import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";

import ColumnsField from "./ColumnsField";
import DimensionsField from "./DimensionsField";
import FiltersField from "./FiltersField";
import LimitField from "./LimitField";
import MetricsField from "./MetricsField";
import OrderByField from "./OrderByField";
import TableSelect from "./TableSelect";

/** Standard mode's query fields; the shared ones live in EditorSidebar. */
export const QueryBuilderFields = () => {
  const chartType = useDashboardEditorStoreContext((state) => state.chart.settings.config.type);
  const isTable = chartType === ChartType.Table;
  // A value chart is one aggregate over the whole range, so it has nothing to group, order or limit.
  const isValue = chartType === ChartType.Value;

  return (
    <>
      <TableSelect />
      {isTable ? <ColumnsField /> : <MetricsField />}
      <FiltersField />
      {!isTable && !isValue && <DimensionsField />}
      {(chartType === ChartType.HorizontalBarChart || isTable) && <OrderByField />}
      {!isTable && !isValue && <LimitField />}
    </>
  );
};
