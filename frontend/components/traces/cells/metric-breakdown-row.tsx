import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface MetricBreakdownRowProps {
  label: string;
  value: ReactNode;
  highlight?: boolean;
  bold?: boolean;
}

export function MetricBreakdownRow({ label, value, highlight, bold }: MetricBreakdownRowProps) {
  return (
    <div className={cn("flex justify-between gap-4 text-xs", highlight ? "text-success-bright" : "text-foreground")}>
      <span className={cn("text-secondary-foreground", bold && "font-semibold text-foreground")}>{label}</span>
      <span className={cn(bold && "font-semibold")}>{value}</span>
    </div>
  );
}
