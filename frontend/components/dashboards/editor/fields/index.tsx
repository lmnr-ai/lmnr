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

  return (
    <>
      <TableSelect />
      {chartType === ChartType.Table ? <ColumnsField /> : <MetricsField />}
      <FiltersField />
      {chartType !== ChartType.Table && <DimensionsField />}
      {(chartType === ChartType.HorizontalBarChart || chartType === ChartType.Table) && <OrderByField />}
      {chartType !== ChartType.Table && <LimitField />}
    </>
  );
};
