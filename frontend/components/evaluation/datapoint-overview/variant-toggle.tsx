import { BarChart3, Crosshair, LayoutGrid, Rows3, Table2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { type OverviewVariant } from "./types";

const VARIANTS: { value: OverviewVariant; label: string; icon: React.ElementType }[] = [
  { value: "grid", label: "Grid", icon: LayoutGrid },
  { value: "hero", label: "Hero", icon: BarChart3 },
  { value: "rail", label: "Rail", icon: Rows3 },
  { value: "table", label: "Table", icon: Table2 },
  { value: "radar", label: "Radar", icon: Crosshair },
];

interface VariantToggleProps {
  value: OverviewVariant;
  onChange: (next: OverviewVariant) => void;
}

export default function VariantToggle({ value, onChange }: VariantToggleProps) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-[4px] border border-border bg-background p-0.5">
      {VARIANTS.map((v) => {
        const Icon = v.icon;
        const isActive = v.value === value;
        return (
          <button
            key={v.value}
            type="button"
            onClick={() => onChange(v.value)}
            className={cn(
              "inline-flex items-center gap-1 h-6 px-2 rounded-[3px] text-xs transition-colors",
              isActive
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
            title={v.label}
            aria-pressed={isActive}
          >
            <Icon className="size-3" />
            <span>{v.label}</span>
          </button>
        );
      })}
    </div>
  );
}
