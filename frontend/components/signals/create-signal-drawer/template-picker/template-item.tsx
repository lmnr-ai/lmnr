"use client";

import { cn } from "@/lib/utils";

export default function TemplateItem({
  icon: Icon,
  label,
  onClick,
  dashed,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  dashed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-[72px] flex-col items-center justify-center gap-1 rounded-md border bg-surface-up-2 px-2 text-center transition-colors hover:bg-surface-up-4",
        dashed && "border-dashed"
      )}
    >
      <Icon className="h-5 w-5 text-muted-foreground" />
      <span className="text-[11px] leading-tight font-medium text-muted-foreground">{label}</span>
    </button>
  );
}
