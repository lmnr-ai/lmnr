import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface BillLineProps {
  label: string;
  detail: ReactNode;
  amountUsd: string;
  color?: string;
  swatchClassName?: string;
  muted?: boolean;
}

export default function BillLine({ label, detail, amountUsd, color, swatchClassName, muted }: BillLineProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="flex items-start gap-2.5 min-w-0">
        <span
          aria-hidden
          className={cn("mt-1.5 size-2 shrink-0 rounded-full", swatchClassName)}
          style={color ? { background: color } : undefined}
        />
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm">{label}</span>
          <span className="text-xs text-muted-foreground">{detail}</span>
        </div>
      </div>
      <span className={cn("text-sm tabular-nums shrink-0", muted && "text-muted-foreground")}>{amountUsd}</span>
    </div>
  );
}
