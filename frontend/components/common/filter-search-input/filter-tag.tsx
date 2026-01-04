"use client";

import { X } from "lucide-react";
import {
  ChangeEvent,
  forwardRef,
  KeyboardEvent,
  memo,
  MouseEvent,
  RefObject,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AutocompleteSuggestion } from "@/lib/actions/autocomplete";
import { Operator } from "@/lib/actions/common/operators";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { cn, swrFetcher } from "@/lib/utils";

import { useFilterSearch } from "./context";
import { ColumnFilter, FilterTag as FilterTagType, getColumnFilter, getOperationsForField, TagFocusPosition } from "./types";

interface FilterTagProps {
  tag: FilterTagType;
  resource?: "traces" | "spans";
  projectId: string;
  isFirst: boolean;
  isLast: boolean;
  isSelected?: boolean;
  onNavigateLeft: () => void;
  onNavigateRight: () => void;
}

export interface FilterTagHandle {
  focusPosition: (position: TagFocusPosition) => void;
}

const FilterTag = forwardRef<FilterTagHandle, FilterTagProps>(
  ({ tag, resource = "traces", projectId, isFirst, isLast, isSelected = false, onNavigateLeft, onNavigateRight }, ref) => {
    const {
      filters,
      updateTagField,
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
    const fieldSelectRef = useRef<HTMLButtonElement>(null);
    const operatorRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const valueSelectRef = useRef<HTMLButtonElement>(null);
    const removeRef = useRef<HTMLButtonElement>(null);

    const [showValueSuggestions, setShowValueSuggestions] = useState(false);
    const debouncedValue = useDebounce(tag.value, 300);

    const isActive = state.activeTagId === tag.id;
    const columnFilter = getColumnFilter(filters, tag.field);
    const operations = getOperationsForField(filters, tag.field);
    const dataType = columnFilter?.dataType || "string";

    const getValueInputRef = useCallback(() => dataType === "enum" || dataType === "boolean" ? valueSelectRef : inputRef, [dataType]);

    // Expose focus control to parent
    useImperativeHandle(ref, () => ({
      focusPosition: (position: TagFocusPosition) => {
        const refs: Record<TagFocusPosition, RefObject<HTMLElement | null>> = {
          field: fieldSelectRef,
          operator: operatorRef,
          value: getValueInputRef(),
          remove: removeRef,
        };
        refs[position].current?.focus();
      },
    }));

    // Fetch value suggestions (only for string type)
    const fetchUrl = useMemo(() => {
      if (!debouncedValue || !isActive || dataType !== "string") return null;
      return `/api/projects/${projectId}/${resource}/autocomplete?prefix=${encodeURIComponent(debouncedValue)}`;
    }, [debouncedValue, isActive, projectId, resource, dataType]);

    const { data: suggestions = { suggestions: [] } } = useSWR<{ suggestions: AutocompleteSuggestion[] }>(
      fetchUrl,
      swrFetcher,
      { fallbackData: { suggestions: [] }, keepPreviousData: true }
    );

    const filteredValueSuggestions = useMemo(
      () => suggestions.suggestions.filter((s) => s.field === tag.field).map((s) => s.value),
      [suggestions.suggestions, tag.field]
    );

    // Auto-focus when tag becomes active (after adding)
    useEffect(() => {
      if (isActive && state.isAddingTag) {
        getValueInputRef().current?.focus();
        setIsAddingTag(false);
      }
    }, [isActive, state.isAddingTag, setIsAddingTag, getValueInputRef]);

    const handleFieldChange = useCallback(
      (field: string) => {
        updateTagField(tag.id, field);
        updateTagValue(tag.id, "");
      },
      [tag.id, updateTagField, updateTagValue]
    );

    const handleValueChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        updateTagValue(tag.id, e.target.value);
        setShowValueSuggestions(true);
      },
      [tag.id, updateTagValue]
    );

    const handleSelectValueChange = useCallback(
      (value: string) => {
        updateTagValue(tag.id, value);
        submit();
      },
      [tag.id, updateTagValue, submit]
    );

    const handleValueBlur = useCallback(() => {
      const isWithinTag = containerRef.current?.contains(document.activeElement);
      if (!isWithinTag && !state.isAddingTag) {
        setShowValueSuggestions(false);
        setActiveTagId(null);
        submit();
      }
    }, [setActiveTagId, submit, state.isAddingTag]);

    // Consolidated keyboard handler for navigation and actions within the tag
    const handleTagKeyDown = useCallback(
      (e: React.KeyboardEvent, position: TagFocusPosition) => {
        // Enter: finish editing and submit (only for value inputs)
        if (e.key === "Enter" && position === "value") {
          e.preventDefault();
          setShowValueSuggestions(false);
          submit();
          focusMainInput();
          return;
        }

        // Escape: cancel and return to main input
        if (e.key === "Escape") {
          e.preventDefault();
          setShowValueSuggestions(false);
          focusMainInput();
          return;
        }

        // Arrow left navigation
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          e.stopPropagation();
          const leftNav: Record<TagFocusPosition, () => void> = {
            remove: () => getValueInputRef().current?.focus(),
            value: () => operatorRef.current?.focus(),
            operator: () => fieldSelectRef.current?.focus(),
            field: () => !isFirst && onNavigateLeft(),
          };
          leftNav[position]();
          return;
        }

        // Arrow right navigation
        if (e.key === "ArrowRight") {
          e.preventDefault();
          e.stopPropagation();
          const rightNav: Record<TagFocusPosition, () => void> = {
            field: () => operatorRef.current?.focus(),
            operator: () => getValueInputRef().current?.focus(),
            value: () => removeRef.current?.focus(),
            remove: () => (isLast ? focusMainInput() : onNavigateRight()),
          };
          rightNav[position]();
          return;
        }

        // Backspace on empty value removes the tag
        if (e.key === "Backspace" && position === "value" && tag.value === "") {
          e.preventDefault();
          removeTag(tag.id);
          focusMainInput();
          return;
        }
      },
      [isFirst, isLast, onNavigateLeft, onNavigateRight, focusMainInput, tag.id, tag.value, removeTag, getValueInputRef, submit]
    );

    const handleValueSuggestionSelect = useCallback(
      (value: string) => {
        updateTagValue(tag.id, value);
        setShowValueSuggestions(false);
        setActiveTagId(null);
        submit();
        focusMainInput();
      },
      [tag.id, updateTagValue, setActiveTagId, submit, focusMainInput]
    );

    const handleRemove = useCallback(
      (e: MouseEvent | KeyboardEvent) => {
        e.stopPropagation();
        if ("key" in e && e.key !== "Enter" && e.key !== " ") return;
        removeTag(tag.id);
        focusMainInput();
      },
      [tag.id, removeTag, focusMainInput]
    );

    const handleActivate = useCallback(
      (e: MouseEvent) => {
        e.stopPropagation();
        setActiveTagId(tag.id);
        getValueInputRef().current?.focus();
      },
      [tag.id, setActiveTagId, getValueInputRef]
    );

    const handleFocus = useCallback(
      (position: TagFocusPosition) => {
        setActiveTagId(tag.id);
        if (position === "value" && dataType === "string") {
          setShowValueSuggestions(true);
        }
      },
      [tag.id, setActiveTagId, dataType]
    );

    if (!columnFilter) return null;

    const selectTriggerClassName = cn(
      "h-6 w-fit min-w-[28px] px-1.5 border-0 rounded-none bg-transparent text-secondary-foreground font-medium text-xs",
      "focus:ring-0 focus:ring-offset-0 focus:bg-accent/50"
    );

    return (
      <div
        ref={containerRef}
        className={cn(
          "inline-flex items-center rounded-md border bg-secondary overflow-hidden h-6",
          "divide-x divide-input transition-all",
          isSelected ? "border-primary ring-2 ring-primary/30" : "border-input"
        )}
        onClick={handleActivate}
      >
        {/* Field Select */}
        <Select value={tag.field} onValueChange={handleFieldChange}>
          <SelectTrigger
            ref={fieldSelectRef}
            className={selectTriggerClassName}
            onClick={(e) => e.stopPropagation()}
            onFocus={() => handleFocus("field")}
            onKeyDown={(e) => handleTagKeyDown(e, "field")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            <ScrollArea className="max-h-64">
              {filters.map((filter) => (
                <SelectItem key={filter.key} value={filter.key}>
                  {filter.name}
                </SelectItem>
              ))}
            </ScrollArea>
          </SelectContent>
        </Select>

        {/* Operator Select */}
        <Select value={tag.operator} onValueChange={(v) => updateTagOperator(tag.id, v as Operator)}>
          <SelectTrigger
            ref={operatorRef}
            className={selectTriggerClassName}
            onClick={(e) => e.stopPropagation()}
            onFocus={() => handleFocus("operator")}
            onKeyDown={(e) => handleTagKeyDown(e, "operator")}
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

        <ValueInput
          dataType={dataType}
          columnFilter={columnFilter}
          value={tag.value}
          showValueSuggestions={showValueSuggestions}
          filteredValueSuggestions={filteredValueSuggestions}
          inputRef={inputRef}
          selectRef={valueSelectRef}
          onValueChange={handleValueChange}
          onSelectValueChange={handleSelectValueChange}
          onBlur={handleValueBlur}
          onKeyDown={(e) => handleTagKeyDown(e, "value")}
          onFocus={() => handleFocus("value")}
          onSuggestionSelect={handleValueSuggestionSelect}
        />

        <Button
          variant="ghost"
          ref={removeRef}
          onClick={handleRemove}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              handleRemove(e);
            } else {
              handleTagKeyDown(e, "remove");
            }
          }}
          onFocus={() => handleFocus("remove")}
          className={cn(
            "h-6 w-6 p-0 rounded-none hover:bg-accent transition-colors outline-none border-0",
            "focus:bg-accent"
          )}
          type="button"
        >
          <X className="w-3 h-3 text-secondary-foreground" />
        </Button>
      </div>
    );
  }
);

FilterTag.displayName = "FilterTag";

// Separate component for value input based on data type
interface ValueInputProps {
  dataType: ColumnFilter["dataType"];
  columnFilter: ColumnFilter;
  value: string;
  showValueSuggestions: boolean;
  filteredValueSuggestions: string[];
  inputRef: RefObject<HTMLInputElement | null>;
  selectRef: RefObject<HTMLButtonElement | null>;
  onValueChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onSelectValueChange: (value: string) => void;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onFocus: () => void;
  onSuggestionSelect: (value: string) => void;
}

const ValueInput = memo(({
  dataType,
  columnFilter,
  value,
  showValueSuggestions,
  filteredValueSuggestions,
  inputRef,
  selectRef,
  onValueChange,
  onSelectValueChange,
  onBlur,
  onKeyDown,
  onFocus,
  onSuggestionSelect,
}: ValueInputProps) => {
  const inputClassName = cn(
    "h-6 px-2 py-0 text-xs bg-transparent text-secondary-foreground outline-none",
    "placeholder:text-muted-foreground min-w-fit max-w-60",
    "focus:bg-accent/50",
    "[field-sizing:content]"
  );

  const selectTriggerClassName = cn(
    "h-6 w-fit min-w-10 max-w-52 px-2 border-0 rounded-none bg-transparent text-secondary-foreground text-xs",
    "focus:ring-0 focus:ring-offset-0 focus:bg-accent/50"
  );

  // Handle keyboard events - pass through to parent handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Always pass through these keys to the parent handler
      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "Backspace" ||
        e.key === "Enter" ||
        e.key === "Escape"
      ) {
        onKeyDown(e);
      }
    },
    [onKeyDown]
  );

  // Parse JSON key=value format (called unconditionally to satisfy React hooks rules)
  const [jsonKey, jsonValue] = useMemo(() => {
    const idx = value.indexOf("=");
    return idx === -1 ? [value, ""] : [value.substring(0, idx), value.substring(idx + 1)];
  }, [value]);

  switch (dataType) {
    case "enum":
      return (
        <Select value={value} onValueChange={onSelectValueChange}>
          <SelectTrigger
            ref={selectRef}
            className={selectTriggerClassName}
            onClick={(e) => e.stopPropagation()}
            onFocus={onFocus}
            onKeyDown={handleKeyDown}
          >
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            <ScrollArea className="max-h-64">
              {columnFilter.dataType === "enum" &&
                columnFilter.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      {option.icon && option.icon}
                      {option.label}
                    </div>
                  </SelectItem>
                ))}
            </ScrollArea>
          </SelectContent>
        </Select>
      );

    case "boolean":
      return (
        <Select value={value} onValueChange={onSelectValueChange}>
          <SelectTrigger
            ref={selectRef}
            className={selectTriggerClassName}
            onClick={(e) => e.stopPropagation()}
            onFocus={onFocus}
            onKeyDown={handleKeyDown}
          >
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">true</SelectItem>
            <SelectItem value="false">false</SelectItem>
          </SelectContent>
        </Select>
      );

    case "number":
      return (
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            type="number"
            value={value}
            onChange={onValueChange}
            onBlur={onBlur}
            onKeyDown={handleKeyDown}
            onFocus={onFocus}
            placeholder="0"
            className={cn(inputClassName, "hide-arrow")}
          />
        </div>
      );

    case "json":
      return (
        <div className="flex items-center divide-x divide-input">
          <input
            ref={inputRef}
            type="text"
            value={jsonKey}
            onChange={(e) => onValueChange({ target: { value: `${e.target.value}=${jsonValue}` } } as React.ChangeEvent<HTMLInputElement>)}
            onBlur={onBlur}
            onKeyDown={handleKeyDown}
            onFocus={onFocus}
            placeholder="key"
            className={cn(inputClassName, "min-w-10 max-w-32")}
          />
          <input
            type="text"
            value={jsonValue}
            onChange={(e) => onValueChange({ target: { value: `${jsonKey}=${e.target.value}` } } as React.ChangeEvent<HTMLInputElement>)}
            onBlur={onBlur}
            onKeyDown={handleKeyDown}
            onFocus={onFocus}
            placeholder="value"
            className={cn(inputClassName, "min-w-10 max-w-32")}
          />
        </div>
      );

    default: // string
      return (
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={onValueChange}
            onBlur={onBlur}
            onKeyDown={handleKeyDown}
            onFocus={onFocus}
            placeholder="..."
            className={inputClassName}
          />
          {showValueSuggestions && filteredValueSuggestions.length > 0 && (
            <div className="absolute top-full left-0 mt-1 z-50 min-w-[120px] max-w-[200px] bg-secondary border rounded-md shadow-md overflow-hidden">
              <ScrollArea className="max-h-36 [&>div]:max-h-36">
                <div className="py-1">
                  {filteredValueSuggestions.map((suggestion, idx) => (
                    <div
                      key={idx}
                      className="px-3 py-1.5 text-xs hover:bg-accent cursor-pointer text-secondary-foreground truncate"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onSuggestionSelect(suggestion);
                      }}
                    >
                      {suggestion}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      );
  }
});

ValueInput.displayName = "ValueInput";

export default memo(FilterTag);
