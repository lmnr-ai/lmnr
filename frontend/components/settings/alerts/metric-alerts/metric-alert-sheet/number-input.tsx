import { type ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** A number kept as text, with its unit shown inside the field. */
export default function NumberInput({ unit, className, ...props }: ComponentProps<typeof Input> & { unit?: string }) {
  return (
    <div className="relative">
      <Input
        type="number"
        inputMode="decimal"
        step="any"
        className={cn("hide-arrow", unit && "pr-16", className)}
        {...props}
      />
      {unit && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {unit}
        </span>
      )}
    </div>
  );
}
