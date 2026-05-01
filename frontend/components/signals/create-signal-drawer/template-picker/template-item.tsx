"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

export default function TemplateItem({
  icon: Icon,
  label,
  extendedLabel,
  description,
  onClick,
  dashed,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  extendedLabel: string;
  description: string;
  onClick: () => void;
  dashed?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "flex flex-col items-center justify-center gap-1 px-2 h-[72px] rounded-md border bg-background transition-colors text-center",
        dashed ? "border-dashed border-input" : "border-input",
        hovered && "bg-accent border-accent-foreground/20"
      )}
    >
      {hovered ? (
        <>
          <span className="text-[11px] font-medium text-foreground leading-tight">{extendedLabel}</span>
          <span className="text-[10px] text-muted-foreground leading-tight">{description}</span>
        </>
      ) : (
        <>
          <Icon className="w-5 h-5 text-muted-foreground" />
          <span className="text-[11px] font-medium text-muted-foreground leading-tight">{label}</span>
        </>
      )}
    </button>
  );
}
