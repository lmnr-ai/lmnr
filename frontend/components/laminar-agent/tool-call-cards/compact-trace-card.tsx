"use client";

import { ListTree, Loader2 } from "lucide-react";

interface CompactTraceCardProps {
  isLoading?: boolean;
}

export function CompactTraceCard({ isLoading }: CompactTraceCardProps) {
  return (
    <div className="bg-muted/50 rounded-lg px-3 py-2 border">
      <div className="flex items-center gap-2">
        <ListTree className="size-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-muted-foreground">
          {isLoading ? "Fetching trace context..." : "Fetched trace context"}
        </span>
        {isLoading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
      </div>
    </div>
  );
}
