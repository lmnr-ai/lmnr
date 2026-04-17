import { Controller, useFormContext } from "react-hook-form";

import { ChartType } from "@/components/chart-builder/types";
import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";
import { tableSchemas } from "@/components/dashboards/editor/table-schemas";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type QueryStructure } from "@/lib/actions/sql/types";

const TableSelect = () => {
  const { control, setValue } = useFormContext<QueryStructure>();
  const { chartType, setChartConfig, chart } = useDashboardEditorStoreContext((state) => ({
    chartType: state.chart.settings.config.type,
    setChartConfig: state.setChartConfig,
    chart: state.chart,
  }));

  const availableTables = Object.keys(tableSchemas);

  const formatTableName = (table: string) =>
    table
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

  const handleTableChange = (newTable: string) => {
    setValue("table", newTable, { shouldValidate: true });

    if (chartType === ChartType.Table) {
      setValue("metrics", [{ fn: "raw", column: "", alias: "", args: [] }], { shouldValidate: true });
      setValue("filters", [], { shouldValidate: true });
      setValue("orderBy", [], { shouldValidate: true });
      setChartConfig({ ...chart.settings.config, hiddenColumns: [] } as typeof chart.settings.config);
    }
  };

  return (
    <div className="grid gap-1">
      <Label className="font-semibold text-xs">Table</Label>
      <Controller
        control={control}
        name="table"
        render={({ field }) => (
          <Select value={field.value} onValueChange={handleTableChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select table" />
            </SelectTrigger>
            <SelectContent>
              {availableTables.map((table) => (
                <SelectItem key={table} value={table}>
                  {formatTableName(table)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  );
};

export default TableSelect;
