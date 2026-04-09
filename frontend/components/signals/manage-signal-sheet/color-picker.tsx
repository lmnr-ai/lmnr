"use client";


import { DEFAULT_SIGNAL_COLOR, SIGNAL_COLOR_PALETTE } from "@/components/signals/utils";
import { cn } from "@/lib/utils";

interface ColorPickerProps {
  value?: string | null;
  onChange: (color: string) => void;
}

export default function ColorPicker({ value, onChange }: ColorPickerProps) {
  const selected = value ?? DEFAULT_SIGNAL_COLOR;

  return (
    <div className="flex flex-wrap gap-3">
      {SIGNAL_COLOR_PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          className={cn(
            "size-4 rounded-full cursor-pointer flex items-center justify-center transition-all",
            "ring-offset-background hover:ring-2 hover:ring-primary/50 hover:ring-offset-2",
            selected === color && "ring-2 ring-primary ring-offset-2"
          )}
          style={{ backgroundColor: color }}
          onClick={() => onChange(color)}
          aria-label={`Select color ${color}`}
        />
      ))}
    </div>
  );
}
