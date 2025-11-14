import { Controller, useFormContext } from "react-hook-form";

import { tableSchemas } from "@/components/dashboard/editor/table-schemas";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryStructure } from "@/lib/actions/sql/types";

const TableSelect = () => {
  const { control } = useFormContext<QueryStructure>();

  const availableTables = Object.keys(tableSchemas);

  const formatTableName = (table: string) => table.charAt(0).toUpperCase() + table.slice(1);

  return (
    <div className="grid gap-1">
      <Label className="font-semibold text-xs">Table</Label>
      <Controller
        control={control}
        name="table"
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
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
