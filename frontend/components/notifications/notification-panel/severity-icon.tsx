import { AlertTriangle, CircleAlert, Info } from "lucide-react";

import { cn } from "@/lib/utils";

export const SeverityIcon = ({ severity, className }: { severity: number; className?: string }) => {
  switch (severity) {
    case 1:
      return <AlertTriangle className={cn("size-3.5 shrink-0 text-orange-400/80", className)} />;
    case 2:
      return <CircleAlert className={cn("size-3.5 shrink-0 text-red-400/100", className)} />;
    default:
      return <Info className={cn("size-3.5 shrink-0 text-muted-foreground/60", className)} />;
  }
};
