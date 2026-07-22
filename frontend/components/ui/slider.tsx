"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import * as React from "react";

import { cn } from "@/lib/utils";

type SliderProps = Omit<SliderPrimitive.Root.Props, "value" | "defaultValue" | "onValueChange" | "onValueCommitted"> & {
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (value: number[]) => void;
  onValueCommitted?: (value: number[]) => void;
};

function toNumberArray(value: number | readonly number[]): number[] {
  return typeof value === "number" ? [value] : [...value];
}

const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, SliderProps>(
  ({ className, value, defaultValue, onValueChange, onValueCommitted, ...props }, ref) => (
    <SliderPrimitive.Root
      ref={ref}
      thumbAlignment="edge"
      className={cn(className)}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange ? (v) => onValueChange(toNumberArray(v)) : undefined}
      onValueCommitted={onValueCommitted ? (v) => onValueCommitted(toNumberArray(v)) : undefined}
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none select-none items-center">
        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-white/20">
          <SliderPrimitive.Indicator className="absolute h-full bg-white" />
          <SliderPrimitive.Thumb className="block h-3 w-3 rounded-full border border-white/50 bg-white shadow-sm transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring data-disabled:pointer-events-none data-disabled:opacity-50" />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
);
Slider.displayName = "Slider";

export { Slider };
