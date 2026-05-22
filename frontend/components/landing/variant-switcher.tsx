"use client";

import { cn } from "@/lib/utils";

// Inline button-group toggle for layout exploration playgrounds (pricing
// calculator, footer, header, blog list, blog post). Mounts above the
// component it controls; remove this together with the variant state once a
// winning layout is picked.

export interface VariantOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

interface Props<T extends string> {
  label: string;
  value: T;
  options: VariantOption<T>[];
  onChange: (v: T) => void;
  className?: string;
}

export default function VariantSwitcher<T extends string>({ label, value, options, onChange, className }: Props<T>) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="text-xs uppercase tracking-wider text-landing-text-400">{label}</span>
      <div className="inline-flex flex-wrap gap-1">
        {options.map((opt) => {
          const isActive = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              title={opt.hint}
              className={cn(
                "px-2.5 py-1 rounded-sm text-xs transition-colors border",
                isActive
                  ? "bg-landing-primary-400 border-landing-primary-400 text-white"
                  : "bg-landing-surface-700 border-landing-surface-500 text-landing-text-300 hover:text-white hover:border-landing-text-500"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
