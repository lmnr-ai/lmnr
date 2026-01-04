"use client";

import { Search } from "lucide-react";
import { KeyboardEvent, memo, useCallback, useEffect, useRef } from "react";

import FilterTag, { FilterTagState } from "@/components/traces/traces-table/filter-tag";
import { ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { Operator } from "@/lib/actions/common/operators";
import { cn } from "@/lib/utils";

interface FilterInputAreaProps {
  filterTags: FilterTagState[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onTagOperatorChange: (tagId: string, operator: Operator) => void;
  onTagValueChange: (tagId: string, value: string) => void;
  onTagRemove: (tagId: string) => void;
  onTagValueSubmit: (tagId: string) => void;
  activeTagId: string | null;
  onTagActivate: (tagId: string) => void;
  availableFilters: ColumnFilter[];
  placeholder?: string;
  className?: string;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
  valueSuggestions: string[];
  showValueSuggestions: boolean;
  onValueInputChange: (tagId: string, value: string) => void;
  onValueSuggestionSelect: (tagId: string, value: string) => void;
}

const FilterInputArea = ({
  filterTags,
  inputValue,
  onInputChange,
  onTagOperatorChange,
  onTagValueChange,
  onTagRemove,
  onTagValueSubmit,
  activeTagId,
  onTagActivate,
  availableFilters,
  placeholder = "Search...",
  className,
  onKeyDown,
  onFocus,
  onBlur,
  valueSuggestions,
  showValueSuggestions,
  onValueInputChange,
  onValueSuggestionSelect,
}: FilterInputAreaProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus input if no tag is active
    if (!activeTagId && inputRef.current && document.activeElement !== inputRef.current) {
      // Only focus if nothing else has focus or if we're coming from a tag
      const activeElement = document.activeElement;
      if (!activeElement || activeElement === document.body) {
        inputRef.current.focus();
      }
    }
  }, [activeTagId]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onInputChange(e.target.value);
    },
    [onInputChange]
  );

  const handleInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      // If backspace at position 0 and we have tags, delete the last tag
      if (e.key === "Backspace" && inputValue === "" && filterTags.length > 0) {
        e.preventDefault();
        const lastTag = filterTags[filterTags.length - 1];
        onTagRemove(lastTag.id);
      } else {
        onKeyDown(e);
      }
    },
    [inputValue, filterTags, onTagRemove, onKeyDown]
  );

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // Only focus input if clicking on container itself, not on tags
    if (e.target === e.currentTarget && inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 rounded-md border border-input bg-transparent",
        "focus-within:ring-border/50 focus-within:ring-[3px] box-border",
        "not-focus-within:bg-accent transition duration-300 min-h-7 py-1",
        className
      )}
      onClick={handleContainerClick}
    >
      <Search className="text-secondary-foreground size-3.5 min-w-3.5 flex-shrink-0" />

      {/* Render filter tags */}
      <div className="flex items-center gap-1 flex-wrap flex-1">
        {filterTags.map((tag) => {
          const columnFilter = availableFilters.find((f) => f.key === tag.field);
          if (!columnFilter) return null;

          return (
            <FilterTag
              key={tag.id}
              tag={tag}
              columnFilter={columnFilter}
              onOperatorChange={(operator) => onTagOperatorChange(tag.id, operator)}
              onValueChange={(value) => onTagValueChange(tag.id, value)}
              onRemove={() => onTagRemove(tag.id)}
              onValueSubmit={() => onTagValueSubmit(tag.id)}
              isActive={activeTagId === tag.id}
              onActivate={() => onTagActivate(tag.id)}
              valueSuggestions={activeTagId === tag.id ? valueSuggestions : []}
              showSuggestions={activeTagId === tag.id && showValueSuggestions}
              onValueInputChange={(value) => onValueInputChange(tag.id, value)}
              onSuggestionSelect={(value) => onValueSuggestionSelect(tag.id, value)}
            />
          );
        })}

        {/* Main input */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={filterTags.length === 0 ? placeholder : ""}
          className={cn(
            "flex-1 min-w-[100px] h-6 bg-transparent text-xs outline-hidden",
            "placeholder:text-muted-foreground"
          )}
        />
      </div>
    </div>
  );
};

export default memo(FilterInputArea);


