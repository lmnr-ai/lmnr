"use client";

import { X } from "lucide-react";
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AutocompleteSuggestion } from "@/lib/actions/autocomplete";
import { Operator } from "@/lib/actions/common/operators";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { cn, swrFetcher } from "@/lib/utils";

import { useFilterSearch } from "./context";
import { FilterTag as FilterTagType, getColumnFilter, getOperationsForField, TagFocusPosition } from "./types";

interface FilterTagProps {
  tag: FilterTagType;
  resource?: "traces" | "spans";
  projectId: string;
  isFirst: boolean;
  isLast: boolean;
  onNavigateLeft: () => void;
  onNavigateRight: () => void;
}

export interface FilterTagHandle {
  focusPosition: (position: TagFocusPosition) => void;
  getFocusedPosition: () => TagFocusPosition | null;
}

const FilterTag = forwardRef<FilterTagHandle, FilterTagProps>(
  ({ tag, resource = "traces", projectId, isFirst, isLast, onNavigateLeft, onNavigateRight }, ref) => {
    const {
      filters,
      updateTagOperator,
      updateTagValue,
      removeTag,
      setActiveTagId,
      submit,
      state,
      focusMainInput,
      setIsAddingTag,
    } = useFilterSearch();

    const containerRef = useRef<HTMLDivElement>(null);
    const fieldRef = useRef<HTMLSpanElement>(null);
    const operatorRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const removeRef = useRef<HTMLButtonElement>(null);

    const [localValue, setLocalValue] = useState(tag.value);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [focusedPosition, setFocusedPosition] = useState<TagFocusPosition | null>(null);
    const debouncedValue = useDebounce(localValue, 300);

    const isActive = state.activeTagId === tag.id;
    const columnFilter = getColumnFilter(filters, tag.field);
    const operations = getOperationsForField(filters, tag.field);

    // Expose focus control to parent
    useImperativeHandle(ref, () => ({
      focusPosition: (position: TagFocusPosition) => {
        setFocusedPosition(position);
        setTimeout(() => {
          switch (position) {
            case "field":
              fieldRef.current?.focus();
              break;
            case "operator":
              operatorRef.current?.focus();
              break;
            case "value":
              inputRef.current?.focus();
              break;
            case "remove":
              removeRef.current?.focus();
              break;
          }
        }, 0);
      },
      getFocusedPosition: () => focusedPosition,
    }));

    // Fetch value suggestions
    const fetchUrl = useMemo(() => {
      if (!debouncedValue || !isActive) return null;
      return `/api/projects/${projectId}/${resource}/autocomplete?prefix=${encodeURIComponent(debouncedValue)}`;
    }, [debouncedValue, isActive, projectId, resource]);

    const { data: suggestions = { suggestions: [] } } = useSWR<{ suggestions: AutocompleteSuggestion[] }>(
      fetchUrl,
      swrFetcher,
      {
        fallbackData: { suggestions: [] },
        keepPreviousData: true,
      }
    );

    // Filter suggestions by current field
    const filteredSuggestions = useMemo(() => suggestions.suggestions.filter((s) => s.field === tag.field).map((s) => s.value), [suggestions.suggestions, tag.field]);

    // Focus input when tag becomes active (after adding)
    useEffect(() => {
      if (isActive && state.isAddingTag) {
        setTimeout(() => {
          inputRef.current?.focus();
          setIsAddingTag(false);
        }, 0);
      }
    }, [isActive, state.isAddingTag, setIsAddingTag]);

    // Sync local value with tag value
    useEffect(() => {
      setLocalValue(tag.value);
    }, [tag.value]);

    const handleValueChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalValue(e.target.value);
      setShowSuggestions(true);
    }, []);

    const handleValueBlur = useCallback(() => {
      // Don't submit if we're in the middle of adding a tag or navigating
      setTimeout(() => {
        // Check if focus moved to another element within this tag
        const activeElement = document.activeElement;
        const isWithinTag = containerRef.current?.contains(activeElement);

        if (!isWithinTag && !state.isAddingTag) {
          updateTagValue(tag.id, localValue);
          setShowSuggestions(false);
          setActiveTagId(null);
          setFocusedPosition(null);
          submit();
        }
      }, 150);
    }, [tag.id, localValue, updateTagValue, setActiveTagId, submit, state.isAddingTag]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent, position: TagFocusPosition) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          e.stopPropagation();

          // Navigate within tag or to previous tag
          switch (position) {
            case "remove":
              setFocusedPosition("value");
              inputRef.current?.focus();
              break;
            case "value":
              setFocusedPosition("operator");
              operatorRef.current?.focus();
              break;
            case "operator":
              setFocusedPosition("field");
              fieldRef.current?.focus();
              break;
            case "field":
              if (!isFirst) {
                onNavigateLeft();
              }
              break;
          }
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          e.stopPropagation();

          // Navigate within tag or to next tag/main input
          switch (position) {
            case "field":
              setFocusedPosition("operator");
              operatorRef.current?.focus();
              break;
            case "operator":
              setFocusedPosition("value");
              inputRef.current?.focus();
              break;
            case "value":
              setFocusedPosition("remove");
              removeRef.current?.focus();
              break;
            case "remove":
              if (isLast) {
                focusMainInput();
              } else {
                onNavigateRight();
              }
              break;
          }
        } else if (e.key === "Enter" && position === "value") {
          e.preventDefault();
          updateTagValue(tag.id, localValue);
          setShowSuggestions(false);
          setActiveTagId(null);
          submit();
          focusMainInput();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setShowSuggestions(false);
          focusMainInput();
        } else if (e.key === "Backspace" && position === "value" && localValue === "") {
          e.preventDefault();
          removeTag(tag.id);
          focusMainInput();
        }
      },
      [
        isFirst,
        isLast,
        onNavigateLeft,
        onNavigateRight,
        focusMainInput,
        tag.id,
        localValue,
        updateTagValue,
        setActiveTagId,
        submit,
        removeTag,
      ]
    );

    const handleSuggestionSelect = useCallback(
      (value: string) => {
        setLocalValue(value);
        updateTagValue(tag.id, value);
        setShowSuggestions(false);
        setActiveTagId(null);
        submit();
        focusMainInput();
      },
      [tag.id, updateTagValue, setActiveTagId, submit, focusMainInput]
    );

    const handleRemove = useCallback(
      (e: React.MouseEvent | React.KeyboardEvent) => {
        e.stopPropagation();
        if ("key" in e && e.key !== "Enter" && e.key !== " ") return;
        removeTag(tag.id);
        focusMainInput();
      },
      [tag.id, removeTag, focusMainInput]
    );

    const handleOperatorClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
    }, []);

    const handleActivate = useCallback(() => {
      setActiveTagId(tag.id);
      setFocusedPosition("value");
      inputRef.current?.focus();
    }, [tag.id, setActiveTagId]);

    const handleFocus = useCallback(
      (position: TagFocusPosition) => {
        setActiveTagId(tag.id);
        setFocusedPosition(position);
        if (position === "value") {
          setShowSuggestions(true);
        }
      },
      [tag.id, setActiveTagId]
    );

    if (!columnFilter) return null;

    return (
      <div
        ref={containerRef}
        className={cn(
          "inline-flex items-center gap-0.5 pl-2 pr-1 rounded bg-primary/10 text-primary h-5"
        )}
        onClick={handleActivate}
      >
        {/* Field Name */}
        <span
          ref={fieldRef}
          tabIndex={0}
          onFocus={() => handleFocus("field")}
          onKeyDown={(e) => handleKeyDown(e, "field")}
          className="text-[11px] font-medium outline-none focus:underline cursor-default"
        >
          {columnFilter.name}
        </span>

        {/* Operator Select */}
        <Select value={tag.operator} onValueChange={(value) => updateTagOperator(tag.id, value as Operator)}>
          <SelectTrigger
            ref={operatorRef}
            className={cn(
              "h-4 w-fit min-w-[24px] px-0.5 border-0 bg-transparent text-primary font-medium text-[11px]",
              "focus:ring-0 focus:ring-offset-0 focus:underline"
            )}
            onClick={handleOperatorClick}
            onFocus={() => handleFocus("operator")}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                handleKeyDown(e, "operator");
              }
            }}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {operations.map(({ key, label }) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Value Input */}
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={localValue}
            onChange={handleValueChange}
            onBlur={handleValueBlur}
            onKeyDown={(e) => handleKeyDown(e, "value")}
            onFocus={() => handleFocus("value")}
            placeholder="..."
            className={cn(
              "h-4 px-0.5 py-0 text-[11px] bg-transparent text-primary outline-none",
              "placeholder:text-primary/40 min-w-[40px] max-w-[120px]",
              "focus:bg-primary/5 rounded-sm"
            )}
          />

          {/* Value Suggestions Dropdown */}
          {showSuggestions && filteredSuggestions.length > 0 && (
            <div className="absolute top-full left-0 mt-1 z-50 min-w-[100px] max-w-[180px] bg-secondary border rounded-md shadow-md max-h-36 overflow-auto">
              {filteredSuggestions.map((suggestion, idx) => (
                <div
                  key={idx}
                  className="px-2 py-1 text-xs hover:bg-accent cursor-pointer text-secondary-foreground truncate"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSuggestionSelect(suggestion);
                  }}
                >
                  {suggestion}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Remove Button */}
        <button
          ref={removeRef}
          onClick={handleRemove}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              handleRemove(e);
            } else {
              handleKeyDown(e, "remove");
            }
          }}
          onFocus={() => handleFocus("remove")}
          className={cn(
            "p-0.5 hover:bg-primary/20 rounded-sm transition-colors outline-none",
            "focus:bg-primary/20"
          )}
          type="button"
        >
          <X className="w-3 h-3 text-primary" />
        </button>
      </div>
    );
  }
);

FilterTag.displayName = "FilterTag";

export default memo(FilterTag);
