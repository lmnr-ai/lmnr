"use client";

import { Info } from "lucide-react";

import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  label: string;
  labelHelp?: string;
  value: string;
  /** Omitted on a derived value, which is read rather than set. The cell keeps
   *  its label and number identical either way — a computed number is the same
   *  kind of number as one you set, and looking different would imply it isn't. */
  slider?: { value: number; max: number; onChange: (i: number) => void };
}

// One vertical rhythm — label, number, control — shared by every input on the
// calculator, so cells line up wherever they are arranged.
const Cell = ({ label, labelHelp, value, slider }: Props) => (
  <div className="min-w-0">
    <div className="flex h-5 items-center gap-1 text-sm text-foreground-300">
      <span>{label}</span>
      {labelHelp && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-label={`About ${label}`} className="cursor-help">
              <Info className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent>{labelHelp}</TooltipContent>
          </TooltipPortal>
        </Tooltip>
      )}
    </div>
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
