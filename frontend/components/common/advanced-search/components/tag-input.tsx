"use client";

import { Check } from "lucide-react";
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

import { useSizeInput } from "@/hooks/use-size-input.tsx";
import { cn } from "@/lib/utils.ts";

export interface FocusableRef {
  focus: () => void;
}

interface TagInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "onKeyDown" | "value"> {
  values: string[];
  onChange: (values: string[]) => void;
  onComplete?: () => void;
  suggestions: string[];
  open?: boolean;
  onNavigateLeft?: () => void;
  onNavigateRight?: () => void;
  ref?: Ref<FocusableRef>;
  maxVisibleChips?: number;
}

const TagInput = ({
  values,
  onChange,
  onBlur,
  onComplete,
  suggestions,
  placeholder = "...",
  className,
  open = false,
  onNavigateLeft,
  onNavigateRight,
  ref,
  maxVisibleChips = 2,
  ...props
}: TagInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const [inputValue, setInputValue] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const autosizeRef = useSizeInput(inputValue);

  const combinedInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      autosizeRef(node);
    },
    [autosizeRef]
  );

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  const allSuggestions = [...new Set([...values.filter((v) => !suggestions.includes(v)), ...suggestions])];

  const filteredSuggestions = allSuggestions
    .filter((s) => !inputValue || s.toLowerCase().includes(inputValue.toLowerCase()))
    .sort((a, b) => {
      const aSelected = values.includes(a);
      const bSelected = values.includes(b);
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      return 0;
    });

  const showDropdown = open && filteredSuggestions.length > 0;

  useEffect(() => {
    setHighlightedIndex(showDropdown ? 0 : -1);
  }, [showDropdown]);

  useEffect(() => {
    if (!showDropdown || highlightedIndex < 0) return;

    const highlightedElement = optionRefs.current[highlightedIndex];
    const viewport = dropdownRef.current;
    if (!highlightedElement || !viewport) return;

    const optionTop = highlightedElement.offsetTop;
    const optionBottom = optionTop + highlightedElement.offsetHeight;
    const viewportTop = viewport.scrollTop;
    const viewportBottom = viewportTop + viewport.clientHeight;

    if (optionTop < viewportTop) {
      viewport.scrollTop = optionTop;
    } else if (optionBottom > viewportBottom) {
      viewport.scrollTop = optionBottom - viewport.clientHeight;
    }
  }, [showDropdown, highlightedIndex]);

  const handleToggleValue = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;

      if (values.includes(trimmed)) {
        onChange(values.filter((v) => v !== trimmed));
      } else {
        onChange([...values, trimmed]);
      }
      setInputValue("");
    },
    [values, onChange]
  );

  const handleAddValue = useCallback(
    (newValue: string) => {
      const trimmed = newValue.trim();
      if (!trimmed || values.includes(trimmed)) return;
      onChange([...values, trimmed]);
      setInputValue("");
    },
    [values, onChange]
  );

  const handleContainerBlur = useCallback(
    (e: React.FocusEvent) => {
      if (containerRef.current?.contains(e.relatedTarget as Node)) {
        return;
      }

      if (inputValue.trim() && !values.includes(inputValue.trim())) {
        onChange([...values, inputValue.trim()]);
        setInputValue("");
      }
      onBlur?.(e as React.FocusEvent<HTMLInputElement>);
    },
    [inputValue, values, onChange, onBlur]
  );

  const handleInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (showDropdown) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHighlightedIndex((prev) => Math.min(prev + 1, filteredSuggestions.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setHighlightedIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === "Enter" && highlightedIndex >= 0) {
          e.preventDefault();
          handleToggleValue(filteredSuggestions[highlightedIndex]);
          return;
        }
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (inputValue.trim()) {
          handleAddValue(inputValue);
        } else {
          onComplete?.();
        }
        return;
      }

      if ((e.key === "," || e.key === "Tab") && inputValue.trim()) {
        e.preventDefault();
        handleAddValue(inputValue);
        return;
      }

      if (e.key === "Backspace" && !inputValue) {
        onNavigateLeft?.();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.stopPropagation();
        return;
      }

      const input = e.target as HTMLInputElement;
      if (e.key === "ArrowLeft" && (input.selectionStart === null || input.selectionStart === 0)) {
        onNavigateLeft?.();
        return;
      }

      if (e.key === "ArrowRight" && (input.selectionStart === null || input.selectionStart === input.value.length)) {
        onNavigateRight?.();
      }
    },
    [
      showDropdown,
      filteredSuggestions,
      highlightedIndex,
      inputValue,
      handleAddValue,
      handleToggleValue,
      onComplete,
      onNavigateLeft,
      onNavigateRight,
    ]
  );

  return (
    <div
      ref={containerRef}
      className={cn("relative flex items-center gap-0.5 px-1", className)}
      onBlur={handleContainerBlur}
    >
      {(open || values.length === 0) && (
        <input
          ref={combinedInputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          className={cn(
            "h-5 py-0 text-xs bg-transparent outline-none text-primary",
            "placeholder:text-primary/50 min-w-4 px-1"
          )}
          {...props}
        />
      )}
      <>
        {values.slice(0, maxVisibleChips).map((value) => (
          <span
            key={value}
            className="inline-flex items-center px-1.5 py-0.5 text-xs rounded bg-secondary text-secondary-foreground"
          >
            <span className="truncate max-w-24">{value}</span>
          </span>
        ))}
        {values.length > maxVisibleChips && (
          <span className="text-xs text-muted-foreground">+{values.length - maxVisibleChips}</span>
        )}
      </>

      {showDropdown && (
        <div
          ref={dropdownRef}
          role="listbox"
          className={cn(
            "absolute top-full left-0 mt-1 z-50 w-48 max-h-48 p-1",
            "bg-popover border shadow-md rounded-md overflow-y-auto no-scrollbar text-secondary-foreground",
            "animate-in fade-in-0 zoom-in-95"
          )}
          onMouseDown={(e) => e.preventDefault()}
        >
          {filteredSuggestions.map((suggestion, index) => {
            const isSelected = values.includes(suggestion);
            return (
              <div
                key={suggestion}
                ref={(el) => {
                  optionRefs.current[index] = el;
                }}
                role="option"
                aria-selected={index === highlightedIndex}
                onMouseDown={() => handleToggleValue(suggestion)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={cn(
                  "relative flex cursor-default items-center justify-between rounded-sm px-2 py-1.5 text-xs outline-none select-none",
                  "hover:bg-accent hover:text-accent-foreground",
                  index === highlightedIndex && "bg-accent text-accent-foreground"
                )}
              >
                <span>{suggestion}</span>
                {isSelected && <Check className="w-3 h-3 text-primary" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TagInput;
