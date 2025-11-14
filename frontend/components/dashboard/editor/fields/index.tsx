import { ChartType } from "@/components/chart-builder/types";
import { useDashboardEditorStoreContext } from "@/components/dashboard/editor/dashboard-editor-store";
import { ScrollArea } from "@/components/ui/scroll-area";

import ChartTypeField from "./ChartTypeField";
import DimensionsField from "./DimensionsField";
import FiltersField from "./FiltersField";
import LimitField from "./LimitField";
import MetricsField from "./MetricsField";
import OrderByField from "./OrderByField";
import TableSelect from "./TableSelect";

export const QueryBuilderFields = () => {
  const chartType = useDashboardEditorStoreContext((state) => state.chart.settings.config.type);

  return (
    <ScrollArea className="col-span-1 border rounded bg-secondary">
      <div className="flex flex-col gap-4 p-4">
        <ChartTypeField />
        <TableSelect />
        <MetricsField />
        <FiltersField />
        <DimensionsField />
        {chartType === ChartType.HorizontalBarChart && <OrderByField />}
        <LimitField />
      </div>
    </ScrollArea>
  );
};
