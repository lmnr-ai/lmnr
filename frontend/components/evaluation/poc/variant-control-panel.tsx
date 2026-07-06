"use client";

import { Check, FlaskConical, X } from "lucide-react";
import { useState } from "react";

import { POC_VARIANTS, usePocVariant, VARIANT_INFO } from "@/components/evaluation/poc/use-poc-variant";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Floating POC chrome (branch-only, never ships): a collapsed pill bottom-right
 * that expands into a radio list of whole-page layout variants. Kept small and
 * monochrome so it contaminates layout judgment as little as possible.
 */
export default function VariantControlPanel() {
  const { variant, setVariant } = usePocVariant();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 h-8 gap-1.5 rounded-full border px-3 text-xs shadow-lg"
        title="Layout POCs"
      >
        <FlaskConical className="size-3.5" />
        {VARIANT_INFO[variant].label}
      </Button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-64 rounded-lg border bg-background shadow-xl">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <FlaskConical className="size-3.5" />
          Layout POCs
        </span>
        <Button variant="ghost" size="icon" className="size-6" onClick={() => setOpen(false)}>
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="flex flex-col p-1.5">
        {POC_VARIANTS.map((v) => (
          <button
            key={v}
            onClick={() => setVariant(v)}
            className={cn(
              "flex items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted",
              v === variant && "bg-muted"
            )}
          >
            <Check className={cn("mt-0.5 size-3.5 shrink-0", v === variant ? "opacity-100" : "opacity-0")} />
            <span className="min-w-0">
              <span className="block text-xs font-medium">{VARIANT_INFO[v].label}</span>
              <span className="block truncate text-[0.7rem] text-muted-foreground">{VARIANT_INFO[v].description}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
