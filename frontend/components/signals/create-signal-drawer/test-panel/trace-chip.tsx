import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type TraceRow } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

export default function TraceChip({
  trace,
  onClear,
  disabled,
}: {
  trace: TraceRow;
  onClear: () => void;
  disabled?: boolean;
}) {
  const label = trace.topSpanName || trace.id;
  return (
    <div
      className={cn(
        "flex items-center gap-2 min-w-0 max-w-full rounded-md border bg-secondary/50 pl-2 pr-1 h-8",
        disabled && "opacity-60"
      )}
    >
      <span className="text-xs text-muted-foreground shrink-0">Trace</span>
      <span className="text-xs font-medium truncate min-w-0" title={label}>
        {label}
      </span>
      <span className="text-xs text-muted-foreground font-mono shrink-0" title={trace.id}>
        {trace.id.slice(0, 8)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={onClear}
        disabled={disabled}
        aria-label="Clear selected trace"
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
