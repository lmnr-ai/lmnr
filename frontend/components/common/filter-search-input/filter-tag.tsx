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
  useState,
} from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AutocompleteSuggestion } from "@/lib/actions/autocomplete";
import { Operator } from "@/lib/actions/common/operators";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { cn, swrFetcher } from "@/lib/utils";

import { useFilterSearch } from "./context";
import SimpleSelect, { SimpleSelectHandle, SimpleSelectOption } from "./simple-select";
import {
  ColumnFilter,
  FilterTag as FilterTagType,
  getColumnFilter,
  getOperationsForField,
  TagFocusPosition,
} from "./types";

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
  (
    { tag, resource = "traces", projectId, isFirst, isLast, isSelected = false, onNavigateLeft, onNavigateRight },
    ref
  ) => {
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
      setOpenSelectId,
    } = useFilterSearch();

    const containerRef = useRef<HTMLDivElement>(null);
    const fieldSelectRef = useRef<SimpleSelectHandle>(null);
    const operatorSelectRef = useRef<SimpleSelectHandle>(null);
    const valueSelectRef = useRef<SimpleSelectHandle>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const removeRef = useRef<HTMLButtonElement>(null);

    const [showValueSuggestions, setShowValueSuggestions] = useState(false);
    const debouncedValue = useDebounce(tag.value, 300);

    const isActive = state.activeTagId === tag.id;
    const columnFilter = getColumnFilter(filters, tag.field);
    const operations = getOperationsForField(filters, tag.field);
    const dataType = columnFilter?.dataType || "string";

    const fieldSelectId = `${tag.id}-field`;
    const operatorSelectId = `${tag.id}-operator`;
    const valueSelectId = `${tag.id}-value`;
    const isFieldSelectOpen = state.openSelectId === fieldSelectId;
    const isOperatorSelectOpen = state.openSelectId === operatorSelectId;
    const isValueSelectOpen = state.openSelectId === valueSelectId;

    const fieldOptions: SimpleSelectOption[] = useMemo(
      () => filters.map((f) => ({ value: f.key, label: f.name })),
      [filters]
    );

    const operatorOptions: SimpleSelectOption[] = useMemo(
      () => operations.map((op) => ({ value: op.key, label: op.label })),
      [operations]
    );

    const focusValueInput = useCallback(() => {
      if (dataType === "enum" || dataType === "boolean") {
        valueSelectRef.current?.focus();
      } else {
        inputRef.current?.focus();
      }
    }, [dataType]);

    // Expose focus control to parent
    useImperativeHandle(ref, () => ({
      focusPosition: (position: TagFocusPosition) => {
        switch (position) {
          case "field":
            fieldSelectRef.current?.focus();
            break;
          case "operator":
            operatorSelectRef.current?.focus();
            break;
          case "value":
            focusValueInput();
            break;
          case "remove":
            removeRef.current?.focus();
            break;
        }
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
        focusValueInput();
        setIsAddingTag(false);
      }
    }, [isActive, state.isAddingTag, setIsAddingTag, focusValueInput]);

    const handleFieldChange = useCallback(
      (field: string) => {
        updateTagField(tag.id, field);
        updateTagValue(tag.id, "");
      },
      [tag.id, updateTagField, updateTagValue]
    );

    const handleOperatorChange = useCallback(
      (operator: string) => {
        updateTagOperator(tag.id, operator as Operator);
      },
      [tag.id, updateTagOperator]
    );

    const handleValueChange = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
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
      if (!isWithinTag && !state.isAddingTag && !state.openSelectId) {
        setShowValueSuggestions(false);
        setActiveTagId(null);
        submit();
      }
    }, [setActiveTagId, submit, state.isAddingTag, state.openSelectId]);

    const handleInputKeyDown = useCallback(
      (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          setShowValueSuggestions(false);
          submit();
          focusMainInput();
          return;
        }

        if (e.key === "Escape") {
          e.preventDefault();
          setShowValueSuggestions(false);
          setOpenSelectId(null);
          focusMainInput();
          return;
        }

        if (e.key === "ArrowLeft") {
          const input = e.target as HTMLInputElement;
          // selectionStart is null for number inputs, so always allow navigation
          if (input.selectionStart === null || input.selectionStart === 0) {
            e.preventDefault();
            operatorSelectRef.current?.focus();
          }
          return;
        }

        if (e.key === "ArrowRight") {
          const input = e.target as HTMLInputElement;
          // selectionStart is null for number inputs, so always allow navigation
          if (input.selectionStart === null || input.selectionStart === input.value.length) {
            e.preventDefault();
            removeRef.current?.focus();
          }
          return;
        }

        if (e.key === "Backspace" && tag.value === "") {
          e.preventDefault();
          removeTag(tag.id);
          focusMainInput();
          return;
        }
      },
      [focusMainInput, tag.id, tag.value, removeTag, submit, setOpenSelectId]
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

    const handleRemoveKeyDown = useCallback(
      (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          handleRemove(e);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          focusValueInput();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          if (isLast) {
            focusMainInput();
          } else {
            onNavigateRight();
          }
        } else if (e.key === "Escape") {
          focusMainInput();
        }
      },
      [handleRemove, isLast, focusMainInput, onNavigateRight, focusValueInput]
    );

    const handleActivate = useCallback(
      (e: MouseEvent) => {
        e.stopPropagation();
        setActiveTagId(tag.id);
      },
      [tag.id, setActiveTagId]
    );

    const handleInputFocus = useCallback(() => {
      setActiveTagId(tag.id);
      if (dataType === "string") {
        setShowValueSuggestions(true);
      }
    }, [tag.id, setActiveTagId, dataType]);

    if (!columnFilter) return null;

    const selectTriggerClassName = cn(
      "h-6 w-fit min-w-[28px] px-1.5 bg-transparent text-secondary-foreground font-medium text-xs"
    );

    return (
      <div
        ref={containerRef}
        className={cn(
          "inline-flex items-center rounded-md border bg-secondary h-6",
          "divide-x divide-input transition-all",
          isSelected ? "border-primary ring-2 ring-primary/30" : "border-input"
        )}
        onClick={handleActivate}
      >
        {/* Field Select */}
        <SimpleSelect
          ref={fieldSelectRef}
          value={tag.field}
          options={fieldOptions}
          onChange={handleFieldChange}
          open={isFieldSelectOpen}
          onOpenChange={(open) => setOpenSelectId(open ? fieldSelectId : null)}
          triggerClassName={selectTriggerClassName}
          onNavigateLeft={() => !isFirst && onNavigateLeft()}
          onNavigateRight={() => operatorSelectRef.current?.focus()}
        />

        {/* Operator Select */}
        <SimpleSelect
          ref={operatorSelectRef}
          value={tag.operator}
          options={operatorOptions}
          onChange={handleOperatorChange}
          open={isOperatorSelectOpen}
          onOpenChange={(open) => setOpenSelectId(open ? operatorSelectId : null)}
          triggerClassName={selectTriggerClassName}
          onNavigateLeft={() => fieldSelectRef.current?.focus()}
          onNavigateRight={() => focusValueInput()}
        />

        {/* Value Input */}
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
          onKeyDown={handleInputKeyDown}
          onFocus={handleInputFocus}
          onSuggestionSelect={handleValueSuggestionSelect}
          isSelectOpen={isValueSelectOpen}
          onSelectOpenChange={(open) => setOpenSelectId(open ? valueSelectId : null)}
          onNavigateLeft={() => operatorSelectRef.current?.focus()}
          onNavigateRight={() => removeRef.current?.focus()}
        />

        <Button
          variant="ghost"
          ref={removeRef}
          onClick={handleRemove}
          onKeyDown={handleRemoveKeyDown}
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
  selectRef: RefObject<SimpleSelectHandle | null>;
  onValueChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onSelectValueChange: (value: string) => void;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onFocus: () => void;
  onSuggestionSelect: (value: string) => void;
  isSelectOpen: boolean;
  onSelectOpenChange: (open: boolean) => void;
  onNavigateLeft: () => void;
  onNavigateRight: () => void;
}

const ValueInput = memo(
  ({
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
    isSelectOpen,
    onSelectOpenChange,
    onNavigateLeft,
    onNavigateRight,
  }: ValueInputProps) => {
    const inputClassName = cn(
      "h-6 px-2 py-0 text-xs bg-transparent text-secondary-foreground outline-none",
      "placeholder:text-muted-foreground min-w-fit max-w-60",
      "focus:bg-accent/50",
      "[field-sizing:content]"
    );

    const selectTriggerClassName = cn(
      "h-6 w-fit min-w-10 max-w-52 px-2 bg-transparent text-secondary-foreground text-xs"
    );

    // Parse JSON key=value format
    const [jsonKey, jsonValue] = useMemo(() => {
      const idx = value.indexOf("=");
      return idx === -1 ? [value, ""] : [value.substring(0, idx), value.substring(idx + 1)];
    }, [value]);

    const enumOptions: SimpleSelectOption[] = useMemo(() => {
      if (columnFilter.dataType !== "enum") return [];
      return columnFilter.options.map((opt) => ({
        value: opt.value,
        label: opt.label,
      }));
    }, [columnFilter]);

    const booleanOptions: SimpleSelectOption[] = [
      { value: "true", label: "true" },
      { value: "false", label: "false" },
    ];

    switch (dataType) {
      case "enum":
        return (
          <SimpleSelect
            ref={selectRef}
            value={value}
            options={enumOptions}
            onChange={onSelectValueChange}
            open={isSelectOpen}
            onOpenChange={onSelectOpenChange}
            placeholder="Select..."
            triggerClassName={selectTriggerClassName}
            onNavigateLeft={onNavigateLeft}
            onNavigateRight={onNavigateRight}
          />
        );

      case "boolean":
        return (
          <SimpleSelect
            ref={selectRef}
            value={value}
            options={booleanOptions}
            onChange={onSelectValueChange}
            open={isSelectOpen}
            onOpenChange={onSelectOpenChange}
            placeholder="Select..."
            triggerClassName={selectTriggerClassName}
            onNavigateLeft={onNavigateLeft}
            onNavigateRight={onNavigateRight}
          />
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
              onKeyDown={onKeyDown}
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
              onChange={(e) =>
                onValueChange({
                  target: { value: `${e.target.value}=${jsonValue}` },
                } as ChangeEvent<HTMLInputElement>)
              }
              onBlur={onBlur}
              onKeyDown={onKeyDown}
              onFocus={onFocus}
              placeholder="key"
              className={cn(inputClassName, "min-w-10 max-w-32")}
            />
            <input
              type="text"
              value={jsonValue}
              onChange={(e) =>
                onValueChange({
                  target: { value: `${jsonKey}=${e.target.value}` },
                } as ChangeEvent<HTMLInputElement>)
              }
              onBlur={onBlur}
              onKeyDown={onKeyDown}
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
              onKeyDown={onKeyDown}
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
  }
);

ValueInput.displayName = "ValueInput";

export default memo(FilterTag);
