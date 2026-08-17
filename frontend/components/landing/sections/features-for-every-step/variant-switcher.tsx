"use client";

import { cn } from "@/lib/utils";

import { type Variant, VARIANTS } from "./graphics";

interface Props {
  value: Variant;
  onChange: (variant: Variant) => void;
}

// AUTHORING AID — remove once a variant is chosen. Swaps all six card graphics
// at once so the set can be judged as a row, not card by card.
const VariantSwitcher = ({ value, onChange }: Props) => (
  <div className="flex items-center rounded border border-surface-300 p-0.5">
    {VARIANTS.map((variant) => (
      <button
        key={variant}
        type="button"
        onClick={() => onChange(variant)}
        className={cn(
          "font-sans-landing w-8 rounded-[2px] py-1 text-sm transition-colors",
          variant === value ? "bg-surface-300 text-white" : "text-foreground-300 hover:text-white"
        )}
      >
        {variant.toUpperCase()}
      </button>
    ))}
  </div>
);

export default VariantSwitcher;
