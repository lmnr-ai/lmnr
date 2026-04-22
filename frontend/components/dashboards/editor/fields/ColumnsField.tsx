import { useMemo } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";

import ColumnsRow from "@/components/dashboards/editor/fields/columns-row";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { type QueryStructure } from "@/lib/actions/sql/types";

const ColumnsField = () => {
  const { control } = useFormContext<QueryStructure>();
  const table = useWatch({ control, name: "table" });
  const metrics = useWatch({ control, name: "metrics" }) || [];

  const { fields, append, remove } = useFieldArray({
    control,
    name: "metrics",
  });

  // Track names already used so we can disable them in other rows' selects.
  const usedColumnNames = useMemo(
    () => new Set(metrics.filter((m) => m.fn === "raw" && m.column && m.column === m.alias).map((m) => m.column)),
    [metrics]
  );

  const handleAdd = () => {
    append({ fn: "raw", column: "", alias: "", args: [] });
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label className="font-semibold text-xs">Columns</Label>
        <Button
          icon="plus"
          size="sm"
          className="text-primary hover:text-primary/80 h-auto py-0.5 px-1"
          variant="ghost"
          onClick={handleAdd}
        >
          Add
        </Button>
      </div>
      <div className="space-y-2">
        {fields.length === 0 ? (
          <p className="text-xs text-muted-foreground">No columns yet — add one to start.</p>
        ) : (
          // Hide metrics flagged `hidden` — those are auto-injected click-target
          // IDs (trace_id/span_id/etc.), not user-managed columns. They still
          // exist in form.metrics and get SELECT'd at execute time; the preview
          // table hides them via the hiddenColumns prop.
          fields.map((field, index) =>
            metrics[index]?.hidden ? null : (
              <ColumnsRow
                key={field.id}
                index={index}
                table={table}
                disabledColumnNames={usedColumnNames}
                onRemove={() => remove(index)}
                canRemove={fields.length > 1}
              />
            )
          )
        )}
      </div>
    </div>
  );
};

export default ColumnsField;
