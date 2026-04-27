"use client";

import { X } from "lucide-react";
import { type KeyboardEvent, useCallback, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface SlackChannelsInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  hasError?: boolean;
}

const stripHash = (value: string) => value.replace(/^#+/, "").trim();

export const SlackChannelsInput = ({
  values,
  onChange,
  placeholder = "Type channel name, then Enter",
  disabled,
  className,
  hasError,
}: SlackChannelsInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState("");

  const addValue = useCallback(
    (raw: string) => {
      const next = stripHash(raw);
      if (!next) return;
      const normalized = next.toLowerCase();
      if (values.some((v) => v.toLowerCase() === normalized)) {
        setInputValue("");
        return;
      }
      onChange([...values, next]);
      setInputValue("");
    },
    [values, onChange]
  );

  const removeValue = useCallback(
    (value: string) => {
      onChange(values.filter((v) => v !== value));
    },
    [values, onChange]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
        if (inputValue.trim()) {
          e.preventDefault();
          addValue(inputValue);
        }
        return;
      }
      if (e.key === "Backspace" && !inputValue && values.length > 0) {
        e.preventDefault();
        removeValue(values[values.length - 1]);
      }
    },
    [inputValue, values, addValue, removeValue]
  );

  const handleBlur = useCallback(() => {
    if (inputValue.trim()) addValue(inputValue);
  }, [inputValue, addValue]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData("text");
      if (!pasted.includes(",") && !pasted.includes("\n") && !pasted.includes(" ")) return;
      e.preventDefault();
      const parts = pasted
        .split(/[,\n\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length === 0) return;
      const normalizedExisting = new Set(values.map((v) => v.toLowerCase()));
      const next = [...values];
      for (const p of parts) {
        const stripped = stripHash(p);
        if (!stripped) continue;
        const key = stripped.toLowerCase();
        if (normalizedExisting.has(key)) continue;
        normalizedExisting.add(key);
        next.push(stripped);
      }
      setInputValue("");
      onChange(next);
    },
    [values, onChange]
  );

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className={cn(
        "flex flex-wrap items-center gap-1 rounded-md border bg-background px-2 py-1 min-h-7",
        "focus-within:ring-1 focus-within:ring-ring",
        hasError && "border-destructive focus-within:ring-destructive",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
    >
      {values.map((value) => (
        <span
          key={value}
          className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-secondary-foreground"
        >
          <span className="truncate max-w-40">#{value}</span>
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Remove ${value}`}
            onClick={(e) => {
              e.stopPropagation();
              removeValue(value);
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onPaste={handlePaste}
        placeholder={values.length === 0 ? placeholder : ""}
        className="flex-1 min-w-20 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
};

export default SlackChannelsInput;
