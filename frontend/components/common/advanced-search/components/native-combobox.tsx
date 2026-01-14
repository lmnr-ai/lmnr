"use client";

import {
  type InputHTMLAttributes,
  type KeyboardEvent,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils.ts";

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface FocusableRef {
  focus: () => void;
}

interface NativeComboboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "onKeyDown"> {
  value: string;
  onChange: (value: string) => void;
  onComplete?: () => void;
  suggestions: string[];
  inputClassName?: string;
  dropdownClassName?: string;
  optionClassName?: string;
  open?: boolean;
  onNavigateLeft?: () => void;
  onNavigateRight?: () => void;
  ref?: Ref<FocusableRef>;
}

const NativeCombobox = ({
  value,
  onChange,
  onBlur,
  onComplete,
  suggestions,
  placeholder = "...",
  className,
  inputClassName,
  dropdownClassName,
  optionClassName,
  open = false,
  onNavigateLeft,
  onNavigateRight,
  ref,
  ...props
}: NativeComboboxProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  useEffect(() => {
    if (open && suggestions.length > 0) {
      setHighlightedIndex(0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [open, suggestions.length]);

  useEffect(() => {
    if (open && highlightedIndex >= 0 && highlightedIndex < optionRefs.current.length) {
      const highlightedElement = optionRefs.current[highlightedIndex];
      const viewport = dropdownRef.current;

      if (highlightedElement && viewport) {
        const optionTop = highlightedElement.offsetTop;
        const optionBottom = optionTop + highlightedElement.offsetHeight;
        const viewportTop = viewport.scrollTop;
        const viewportBottom = viewportTop + viewport.clientHeight;

        if (optionTop < viewportTop) {
          viewport.scrollTop = optionTop;
        } else if (optionBottom > viewportBottom) {
          viewport.scrollTop = optionBottom - viewport.clientHeight;
        }
      }
    }
  }, [open, highlightedIndex]);

  const handleSelectSuggestion = useCallback(
    (suggestion: string) => {
      onChange(suggestion);
      onComplete?.();
    },
    [onChange, onComplete]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (open && suggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHighlightedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setHighlightedIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === "Enter" && highlightedIndex >= 0) {
          e.preventDefault();
          handleSelectSuggestion(suggestions[highlightedIndex]);
          return;
        }
      }

      if (e.key === "Enter" && (!open || suggestions.length === 0 || highlightedIndex < 0)) {
        e.preventDefault();
        onComplete?.();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.stopPropagation();
        return;
      }

      const input = e.target as HTMLInputElement;
      if (e.key === "ArrowLeft") {
        if (input.selectionStart === null || input.selectionStart === 0) {
          onNavigateLeft?.();
          return;
        }
      }

      if (e.key === "ArrowRight") {
        if (input.selectionStart === null || input.selectionStart === input.value.length) {
          onNavigateRight?.();
          return;
        }
      }
    },
    [open, suggestions, highlightedIndex, onComplete, handleSelectSuggestion, onNavigateLeft, onNavigateRight]
  );

  return (
    <div className={cn("relative flex items-center", className)}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onBlur}
        placeholder={placeholder}
        className={inputClassName}
        {...props}
      />
      {open && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          role="listbox"
          className={cn(
            "absolute top-full left-0 mt-1 z-50 w-48 max-h-48 p-1",
            "bg-popover border shadow-md rounded-md overflow-y-auto no-scrollbar",
            "animate-in fade-in-0 zoom-in-95",
            dropdownClassName
          )}
          onMouseDown={(e) => e.preventDefault()}
        >
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion}
              ref={(el) => {
                optionRefs.current[index] = el;
              }}
              role="option"
              aria-selected={index === highlightedIndex}
              onMouseDown={() => handleSelectSuggestion(suggestion)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={cn(
                "relative flex cursor-default items-center rounded-sm px-2 py-1.5 text-xs outline-none select-none",
                "hover:bg-accent hover:text-accent-foreground",
                index === highlightedIndex && "bg-accent text-accent-foreground",
                optionClassName
              )}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NativeCombobox;
