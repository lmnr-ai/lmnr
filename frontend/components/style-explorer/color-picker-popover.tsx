"use client";

// TEMPORARY style exploration tooling — safe to delete this folder + the mount in layout.tsx.
// Swatch button -> popover with a react-colorful HSL picker, bound to a bare "H S% L%" triplet.

import { HslColorPicker } from "react-colorful";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { formatHslTriplet, hslCss, parseHslTriplet } from "./tokens";

export default function ColorPickerPopover({
  value,
  onChange,
}: {
  value: string;
  onChange: (triplet: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Pick color"
          className="size-5 shrink-0 rounded border border-border"
          style={{ backgroundColor: hslCss(value) }}
        />
      </PopoverTrigger>
      <PopoverContent className="z-[10000] w-auto p-3" align="end">
        <HslColorPicker color={parseHslTriplet(value)} onChange={(c) => onChange(formatHslTriplet(c))} />
        <div className="mt-2 text-center font-mono text-[11px] text-muted-foreground">{value}</div>
      </PopoverContent>
    </Popover>
  );
}
