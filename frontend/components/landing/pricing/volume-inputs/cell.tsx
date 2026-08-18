"use client";

import { Slider } from "@/components/ui/slider";

interface Props {
  label: string;
  value: string;
  /** Omitted on a derived value, which is read rather than set. The cell keeps
   *  its label and number identical either way — a computed number is the same
   *  kind of number as one you set, and looking different would imply it isn't. */
  slider?: { value: number; max: number; onChange: (i: number) => void };
}

// One vertical rhythm — label, number, control — shared by every input on the
// calculator, so cells line up wherever they are arranged.
const Cell = ({ label, value, slider }: Props) => (
  <div className="min-w-0">
    <span className="block text-sm text-foreground-300 h-5">{label}</span>
    <span className="block text-[28px] leading-9 text-white tabular-nums">{value}</span>
    {slider && (
      <Slider
        value={[slider.value]}
        max={slider.max}
        min={0}
        step={1}
        onValueChange={(v) => slider.onChange(v[0])}
        className="w-full mt-3"
      />
    )}
  </div>
);

export default Cell;
