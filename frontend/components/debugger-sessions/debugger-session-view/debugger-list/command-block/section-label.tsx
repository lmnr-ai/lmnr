import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

// Small uppercase caption above a command block's panes — COMMAND / STDOUT /
// STDERR. Shared so the three panes (and both command renderers) stay identical.
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("px-3 pt-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground", className)}>
      {children}
    </div>
  );
}
