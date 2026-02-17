"use client";

import { X } from "lucide-react";
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
  ...props
}: TagInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const [inputValue, setInputValue] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [focusedTagIndex, setFocusedTagIndex] = useState<number | null>(null);
  const tagRefs = useRef<(HTMLSpanElement | null)[]>([]);

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

  // Filter out already selected values from suggestions
  const filteredSuggestions = suggestions
    .filter((s) => !values.includes(s))
    .filter((s) => !inputValue || s.toLowerCase().includes(inputValue.toLowerCase()));

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

  const handleSelectValue = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || values.includes(trimmed)) return;
      onChange([...values, trimmed]);
      setInputValue("");
    },
    [values, onChange]
  );

  const handleRemoveValue = useCallback(
    (value: string) => {
      onChange(values.filter((v) => v !== value));
      setFocusedTagIndex(null);
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
          handleSelectValue(filteredSuggestions[highlightedIndex]);
          return;
        }
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (inputValue.trim()) {
          handleSelectValue(inputValue);
        } else {
          onComplete?.();
        }
        return;
      }

      if ((e.key === "," || e.key === "Tab") && inputValue.trim()) {
        e.preventDefault();
        handleSelectValue(inputValue);
        return;
      }

      if (e.key === "Backspace" && !inputValue) {
        if (values.length > 0) {
          const lastIndex = values.length - 1;
          setFocusedTagIndex(lastIndex);
          tagRefs.current[lastIndex]?.focus();
        } else {
          onNavigateLeft?.();
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.stopPropagation();
        return;
      }

      const input = e.target as HTMLInputElement;
      if (e.key === "ArrowLeft" && (input.selectionStart === null || input.selectionStart === 0)) {
        if (values.length > 0) {
          const lastIndex = values.length - 1;
          setFocusedTagIndex(lastIndex);
          tagRefs.current[lastIndex]?.focus();
        } else {
          onNavigateLeft?.();
        }
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
      values.length,
      handleSelectValue,
      onComplete,
      onNavigateLeft,
      onNavigateRight,
    ]
  );

  const handleTagKeyDown = useCallback(
    (e: KeyboardEvent<HTMLSpanElement>, index: number) => {
      if (e.key === "Enter" || e.key === "Backspace") {
        e.preventDefault();
        const valueToRemove = values[index];
        handleRemoveValue(valueToRemove);
        // Focus input after removing
        inputRef.current?.focus();
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (index > 0) {
          setFocusedTagIndex(index - 1);
          tagRefs.current[index - 1]?.focus();
        } else {
          onNavigateLeft?.();
        }
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (index < values.length - 1) {
          setFocusedTagIndex(index + 1);
          tagRefs.current[index + 1]?.focus();
        } else {
          setFocusedTagIndex(null);
          inputRef.current?.focus();
        }
        return;
      }

      if (e.key === "Escape") {
        setFocusedTagIndex(null);
        inputRef.current?.focus();
      }
    },
    [values, handleRemoveValue, onNavigateLeft]
  );

  return (
    <div
      ref={containerRef}
      className={cn("relative flex items-center gap-1 px-1", className)}
      onBlur={handleContainerBlur}
    >
      <>
        {values.map((value, index) => (
          <span
            key={value}
            ref={(el) => {
              tagRefs.current[index] = el;
            }}
            tabIndex={0}
            onKeyDown={(e) => handleTagKeyDown(e, index)}
            onFocus={() => setFocusedTagIndex(index)}
            onBlur={() => setFocusedTagIndex(null)}
            className={cn(
              "inline-flex items-center gap-0.5 px-1 py-0.25 text-xs rounded bg-muted text-secondary-foreground outline-none",
              focusedTagIndex === index && "ring-1 ring-primary"
            )}
          >
            <span className="truncate max-w-24">{value}</span>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveValue(value);
              }}
              onMouseDown={(e) => e.preventDefault()}
              className="ml-0.5 hover:text-foreground focus:outline-none"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </>
      {(open || values.length === 0) && (
        <div className="relative">
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
              {filteredSuggestions.map((suggestion, index) => (
                <div
                  key={suggestion}
                  ref={(el) => {
                    optionRefs.current[index] = el;
                  }}
                  role="option"
                  aria-selected={index === highlightedIndex}
                  onMouseDown={() => handleSelectValue(suggestion)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={cn(
                    "relative flex cursor-default items-center rounded-sm px-2 py-1.5 text-xs outline-none select-none",
                    "hover:bg-accent hover:text-accent-foreground",
                    index === highlightedIndex && "bg-accent text-accent-foreground"
                  )}
                >
                  <span className="truncate">{suggestion}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TagInput;
