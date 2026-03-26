import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

interface PreviewLoadingPlaceholderProps {
  className?: string;
  compact?: boolean;
}

export function PreviewLoadingPlaceholder({ className, compact = false }: PreviewLoadingPlaceholderProps) {
  if (compact) {
    return (
      <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <Sparkles className="size-3 shimmer" />
        <span className="shimmer">Generating...</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md bg-muted/50 px-3 py-3 text-sm text-muted-foreground",
        className
      )}
    >
      <Sparkles className="size-3.5 shrink-0 shimmer" />
      <span className="shimmer">Generating preview…</span>
    </div>
  );
}
