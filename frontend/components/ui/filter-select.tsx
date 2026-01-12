"use client";

import {
  HTMLAttributes,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

export interface FilterSelectOption {
  value: string;
  label: string;
}

export interface FocusableRef {
  focus: () => void;
}

interface FilterSelectProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
  options: FilterSelectOption[];
  onValueChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder?: string;
  triggerClassName?: string;
  contentClassName?: string;
  onNavigateLeft?: () => void;
  onNavigateRight?: () => void;
  ref?: Ref<FocusableRef>;
}

const FilterSelect = ({
  value,
  options,
  onValueChange,
  open,
  onOpenChange,
  placeholder = "Select...",
  className,
  triggerClassName,
  contentClassName,
  onNavigateLeft,
  onNavigateRight,
  ref,
  ...props
}: FilterSelectProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const listboxId = useRef(`listbox-${Math.random().toString(36).slice(2, 9)}`).current;

  const selectedOption = options.find((o) => o.value === value);
  const selectedIndex = options.findIndex((o) => o.value === value);

  useImperativeHandle(ref, () => ({
    focus: () => triggerRef.current?.focus(),
  }));

  useEffect(() => {
    if (open) {
      setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (open && highlightedIndex >= 0 && highlightedIndex < optionRefs.current.length) {
      const highlightedElement = optionRefs.current[highlightedIndex];
      const viewport = scrollViewportRef.current;

      if (highlightedElement && viewport) {
        const optionTop = highlightedElement.offsetTop;
        const optionBottom = optionTop + highlightedElement.offsetHeight;
        const viewportTop = viewport.scrollTop;
        const viewportBottom = viewportTop + viewport.clientHeight;

        // Scroll if option is above viewport
        if (optionTop < viewportTop) {
          viewport.scrollTop = optionTop;
        }
        // Scroll if option is below viewport
        else if (optionBottom > viewportBottom) {
          viewport.scrollTop = optionBottom - viewport.clientHeight;
        }
      }
    }
  }, [open, highlightedIndex]);

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
      // Handle left/right navigation regardless of open state
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        onNavigateLeft?.();
        triggerRef.current?.blur();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        onNavigateRight?.();
        triggerRef.current?.blur();
        return;
      }

      if (!open) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
          e.preventDefault();
          onOpenChange(true);
          return;
        }
        return;
      }

      // When open, handle dropdown navigation
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
            onValueChange(options[highlightedIndex].value);
            onOpenChange(false);
          }
          break;
        case "Escape":
          e.preventDefault();
          onOpenChange(false);
          break;
      }
    },
    [open, highlightedIndex, options, onValueChange, onOpenChange, onNavigateLeft, onNavigateRight]
  );

  const handleOptionMouseDown = useCallback(
    (optionValue: string) => (e: ReactMouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onValueChange(optionValue);
    },
    [onValueChange]
  );

  return (
    <div ref={containerRef} className={cn("relative", className)} {...props}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        className={cn(
          "flex items-center justify-center gap-1 cursor-pointer select-none w-fit",
          "outline-none focus-visible:bg-accent/50",
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
          ref={scrollViewportRef}
          id={listboxId}
          role="listbox"
          className={cn(
            "absolute top-full left-0 z-50 mt-1 min-w-[8rem] max-h-32",
            "bg-popover text-popover-foreground",
            "rounded-md border shadow-md p-1",
            "overflow-y-auto no-scrollbar",
            "animate-in fade-in-0 zoom-in-95",
            contentClassName
          )}
          onMouseDown={(e) => e.preventDefault()}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              ref={(el) => {
                optionRefs.current[index] = el;
              }}
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
};

export default FilterSelect;
