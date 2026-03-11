"use client";

import { X } from "lucide-react";
import { useCallback, useState } from "react";

export default function EnumValuesInput({
  values,
  onChange,
}: {
  values: string[] | undefined;
  onChange: (values: string[] | undefined) => void;
}) {
  const [inputValue, setInputValue] = useState("");

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const trimmed = inputValue.trim();
        if (trimmed && !values?.includes(trimmed)) {
          onChange([...(values || []), trimmed]);
          setInputValue("");
        }
      } else if (e.key === "Backspace" && !inputValue && values && values.length > 0) {
        onChange(values.slice(0, -1));
      }
    },
    [inputValue, values, onChange]
  );

  const removeValue = useCallback(
    (valueToRemove: string) => {
      const newValues = values?.filter((v) => v !== valueToRemove);
      onChange(newValues && newValues.length > 0 ? newValues : undefined);
    },
    [values, onChange]
  );

  return (
    <div className="flex flex-wrap items-center gap-1 min-h-7 px-2 py-1 border rounded-md bg-background w-full">
      {values?.map((value) => (
        <span
          key={value}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs bg-muted text-secondary-foreground rounded"
        >
          {value}
          <button
            type="button"
            onClick={() => removeValue(value)}
            className="hover:text-destructive text-muted-foreground transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={values?.length ? "" : "Add values..."}
        className="flex-1 min-w-16 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
