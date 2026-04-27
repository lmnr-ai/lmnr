import { Controller, useFormContext } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type QueryStructure } from "@/lib/actions/sql/types";

const LimitField = () => {
  const { control } = useFormContext<QueryStructure>();

  return (
    <div className="grid gap-2">
      <Label className="font-semibold text-xs">
        Limit <span className="text-muted-foreground font-normal">(optional)</span>
      </Label>
      <Controller
        control={control}
        name="limit"
        render={({ field }) => (
          <Input
            type="number"
            min={1}
            placeholder="Enter numeric limit"
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
              field.onChange(parsed);
            }}
            className="text-xs! placeholder:text-xs hide-arrow"
          />
        )}
      />
    </div>
  );
};

export default LimitField;
