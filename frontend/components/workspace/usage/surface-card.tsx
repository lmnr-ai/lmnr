import { type ReactNode } from "react";

import { ElevatedSurface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

interface SurfaceCardProps {
  title: string;
  note?: string;
  className?: string;
  children: ReactNode;
}

export default function SurfaceCard({ title, note, className, children }: SurfaceCardProps) {
  return (
    <ElevatedSurface className={cn("flex flex-col gap-3 rounded-lg p-4", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        {note && <span className="text-xs text-muted-foreground shrink-0">{note}</span>}
      </div>
      {children}
    </ElevatedSurface>
  );
}
