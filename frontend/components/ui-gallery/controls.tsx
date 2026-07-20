"use client";

interface ControlsProps {
  variants: Record<string, string[]>;
  selection: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export default function Controls({ variants, selection, onChange }: ControlsProps) {
  return (
    <div className="flex flex-wrap gap-4">
      {Object.entries(variants).map(([key, options]) => (
        <label key={key} className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span className="font-medium">{key}</span>
          <select
            className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
            value={selection[key]}
            onChange={(e) => onChange(key, e.target.value)}
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
