import { Controller, useFormContext } from "react-hook-form";

import { ChartType } from "@/components/chart-builder/types";
import { TABLE_DEFAULT_LIMIT, TABLE_MAX_LIMIT } from "@/components/dashboards/editor/constants";
import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type QueryStructure } from "@/lib/actions/sql/types";

const LimitField = () => {
  const { control } = useFormContext<QueryStructure>();
  const chartType = useDashboardEditorStoreContext((state) => state.chart.settings.config.type);
  const isTable = chartType === ChartType.Table;

  return (
    <div className="grid gap-2">
      <Label className="font-semibold text-xs">
        Limit{" "}
        {isTable ? (
          <span className="text-muted-foreground font-normal">(required, max {TABLE_MAX_LIMIT})</span>
        ) : (
          <span className="text-muted-foreground font-normal">(optional)</span>
        )}
      </Label>
      <Controller
        control={control}
        name="limit"
        render={({ field }) => (
          <Input
            type="number"
            min={1}
            max={isTable ? TABLE_MAX_LIMIT : undefined}
            placeholder={isTable ? `e.g. ${TABLE_DEFAULT_LIMIT}` : "Enter numeric limit"}
            value={field.value || ""}
            onChange={(e) => {
              const raw = e.target.value;
              if (!raw) {
                field.onChange(undefined);
                return;
              }
              const parsed = parseInt(raw);
              if (Number.isNaN(parsed)) {
                field.onChange(undefined);
                return;
              }
              // Cap at TABLE_MAX_LIMIT for table charts so users can't exceed it.
              field.onChange(isTable ? Math.min(Math.max(1, parsed), TABLE_MAX_LIMIT) : parsed);
            }}
            className="text-xs! placeholder:text-xs hide-arrow"
          />
        )}
      />
    </div>
  );
};

export default LimitField;
