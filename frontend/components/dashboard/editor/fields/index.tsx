import { useFormContext, useWatch } from "react-hook-form";

import { ChartType } from "@/components/chart-builder/types";
import { VisualQueryBuilderForm } from "@/components/dashboard/editor/types";
import { ScrollArea } from "@/components/ui/scroll-area";

import ChartTypeField from "./ChartTypeField";
import DimensionsField from "./DimensionsField";
import FiltersField from "./FiltersField";
import LimitField from "./LimitField";
import MetricsField from "./MetricsField";
import OrderByField from "./OrderByField";
import TableSelect from "./TableSelect";

export const QueryBuilderFields = () => {
  const { control } = useFormContext<VisualQueryBuilderForm>();
  const formValues = useWatch({ control });

  return (
    <ScrollArea className="col-span-1 border rounded bg-secondary">
      <div className="flex flex-col gap-4 p-4">
        <ChartTypeField />
        <TableSelect />
        <MetricsField />
        <FiltersField />
        <DimensionsField />
        {formValues.chartType === ChartType.HorizontalBarChart && <OrderByField />}
        <LimitField />
      </div>
    </ScrollArea>
  );
};
