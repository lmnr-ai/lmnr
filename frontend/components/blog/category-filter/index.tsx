"use client";

import { cn } from "@/lib/utils";

export interface CategoryOption {
  value: string;
  label: string;
  count: number;
}

interface CategoryFilterProps {
  categories: CategoryOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export default function CategoryFilter({ categories, value, onChange, className }: CategoryFilterProps) {
  return (
    <div className={cn("w-full overflow-x-auto no-scrollbar", className)}>
      <div className="flex items-center gap-2 min-w-max">
        {categories.map((cat) => {
          const active = cat.value === value;
          return (
            <button
              key={cat.value}
              type="button"
              onClick={() => onChange(cat.value)}
              aria-pressed={active}
              className={cn(
                "whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-landing-surface-500 text-landing-text-300 hover:text-landing-text-100 hover:border-landing-surface-400"
              )}
            >
              {cat.label}{" "}
              <span className={cn("ml-1", active ? "opacity-80" : "text-landing-text-500")}>({cat.count})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
