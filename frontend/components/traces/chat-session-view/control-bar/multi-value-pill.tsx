import { type ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface MultiValuePillProps {
  values: string[];
  /** Plural noun for the collapsed label, e.g. "models" → "2 models". */
  noun: string;
  icon: ReactNode;
  className: string;
  renderSingle: (value: string) => ReactNode;
  renderItem: (value: string) => ReactNode;
}

/** One value renders as-is; several collapse into "N <noun>" that opens a popover listing them. */
export default function MultiValuePill({
  values,
  noun,
  icon,
  className,
  renderSingle,
  renderItem,
}: MultiValuePillProps) {
  if (values.length === 0) return null;
  if (values.length === 1) return renderSingle(values[0]);

  return (
    <Popover>
      <PopoverTrigger className={cn(className, "cursor-pointer hover:overlay-hover active:overlay-selected")}>
        {icon}
        {values.length} {noun}
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-fit max-w-96 flex-col gap-1.5 p-2">
        {values.map((v) => (
          <div key={v}>{renderItem(v)}</div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
