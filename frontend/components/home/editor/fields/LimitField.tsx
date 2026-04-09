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
            placeholder="Enter numeric limit"
            value={field.value || ""}
            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
            className="text-xs! placeholder:text-xs hide-arrow"
          />
        )}
      />
    </div>
  );
};

export default LimitField;
