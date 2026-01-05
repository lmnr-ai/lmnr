"use client";

import { forwardRef, KeyboardEvent, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface SimpleSelectOption {
  value: string;
  label: string;
}

export interface SimpleSelectHandle {
  focus: () => void;
}

interface SimpleSelectProps {
  value: string;
  options: SimpleSelectOption[];
  onChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  onNavigateLeft?: () => void;
  onNavigateRight?: () => void;
}

const SimpleSelect = forwardRef<SimpleSelectHandle, SimpleSelectProps>(
  (
    {
      value,
      options,
      onChange,
      open,
      onOpenChange,
      placeholder = "Select...",
      className,
      triggerClassName,
      contentClassName,
      onNavigateLeft,
      onNavigateRight,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const selectedOption = options.find((o) => o.value === value);
    const selectedIndex = options.findIndex((o) => o.value === value);

    useImperativeHandle(ref, () => ({
      focus: () => triggerRef.current?.focus(),
    }));

    useEffect(() => {
      if (open) {
        setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
      }
    }, [open, selectedIndex]);

    useEffect(() => {
      if (!open) return;

      const handleClickOutside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          onOpenChange(false);
        }
      };

      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open, onOpenChange]);

    const handleKeyDown = useCallback(
      (e: KeyboardEvent) => {
        if (!open) {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            e.stopPropagation();
            onNavigateLeft?.();
            return;
          }
          if (e.key === "ArrowRight") {
            e.preventDefault();
            e.stopPropagation();
            onNavigateRight?.();
            return;
          }
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
            e.preventDefault();
            onOpenChange(true);
            return;
          }
          return;
        }

        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            setHighlightedIndex((prev) => Math.min(prev + 1, options.length - 1));
            break;
          case "ArrowUp":
            e.preventDefault();
            setHighlightedIndex((prev) => Math.max(prev - 1, 0));
            break;
          case "Enter":
          case " ":
            e.preventDefault();
            if (highlightedIndex >= 0 && highlightedIndex < options.length) {
              onChange(options[highlightedIndex].value);
              onOpenChange(false);
            }
            break;
          case "Escape":
            e.preventDefault();
            onOpenChange(false);
            break;
          case "ArrowLeft":
            e.preventDefault();
            onOpenChange(false);
            onNavigateLeft?.();
            break;
          case "ArrowRight":
            e.preventDefault();
            onOpenChange(false);
            onNavigateRight?.();
            break;
        }
      },
      [open, highlightedIndex, options, onChange, onOpenChange, onNavigateLeft, onNavigateRight]
    );

    const handleOptionMouseDown = useCallback(
      (optionValue: string) => (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onChange(optionValue);
        onOpenChange(false);
      },
      [onChange, onOpenChange]
    );

    return (
      <div ref={containerRef} className={cn("relative", className)}>
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          className={cn(
            "flex items-center justify-between gap-1 cursor-pointer select-none",
            "outline-none focus:bg-accent/50",
            triggerClassName
          )}
          onClick={() => onOpenChange(!open)}
          onKeyDown={handleKeyDown}
        >
          <span className="truncate">
            {selectedOption?.label ?? <span className="text-muted-foreground">{placeholder}</span>}
          </span>
        </button>

        {open && (
          <div
            role="listbox"
            className={cn(
              "absolute top-full left-0 z-50 mt-1 min-w-[8rem]",
              "bg-popover text-popover-foreground",
              "rounded-md border p-1 shadow-md",
              "animate-in fade-in-0 zoom-in-95",
              contentClassName
            )}
            onMouseDown={(e) => e.preventDefault()}
          >
            {options.map((option, index) => (
              <div
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                className={cn(
                  "relative flex cursor-default items-center rounded-sm px-2 py-1.5 text-xs outline-none select-none",
                  "hover:bg-accent hover:text-accent-foreground",
                  index === highlightedIndex && "bg-accent text-accent-foreground",
                  option.value === value && index !== highlightedIndex && "bg-accent/50"
                )}
                onMouseDown={handleOptionMouseDown(option.value)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                {option.label}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
);

SimpleSelect.displayName = "SimpleSelect";

export default SimpleSelect;
