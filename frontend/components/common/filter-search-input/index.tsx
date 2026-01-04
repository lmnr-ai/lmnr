"use client";

import { Search } from "lucide-react";
import { useParams } from "next/navigation";
import { ChangeEvent, memo, useCallback, useRef } from "react";

import { cn } from "@/lib/utils";

import { FilterSearchProvider, StatefulFilterProvider, useFilterSearch } from "./context";
import FilterTag, { FilterTagHandle } from "./filter-tag";
import SuggestionsDropdown, { getSuggestionAtIndex, getSuggestionsCount } from "./suggestions";
import { ColumnFilter } from "./types";

interface FilterSearchInputInnerProps {
  placeholder?: string;
  className?: string;
  resource?: "traces" | "spans";
}

const FilterSearchInputInner = ({
  placeholder = "Search...",
  className,
  resource = "traces",
}: FilterSearchInputInnerProps) => {
  const params = useParams();
  const projectId = params.projectId as string;
  const {
    state,
    filters,
    setInputValue,
    setIsOpen,
    setActiveIndex,
    removeTag,
    mainInputRef,
    submit,
    addTag,
    setIsAddingTag,
    selectAllTags,
    clearSelection,
    removeSelectedTags,
  } = useFilterSearch();

  const tagHandlesRef = useRef<Map<string, FilterTagHandle>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      // Remove selected tags when typing (overwrite behavior like native input)
      // This catches paste operations and any input that bypasses keydown
      if (state.selectedTagIds.size > 0) {
        removeSelectedTags();
      }
      setInputValue(e.target.value);
      setIsOpen(true);
    },
    [setInputValue, setIsOpen, state.selectedTagIds.size, removeSelectedTags]
  );

  const handleInputFocus = useCallback(() => setIsOpen(true), [setIsOpen]);

  const handleInputBlur = useCallback(() => {
    // Don't submit if a filter tag is being edited
    if (state.activeTagId) return;
    if (state.isAddingTag) return;
    setIsOpen(false);
    submit();
  }, [setIsOpen, submit, state.isAddingTag, state.activeTagId]);

  // Consolidated keyboard handler for main input
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const input = mainInputRef.current;
      const count = getSuggestionsCount(filters, state.inputValue);

      // Cmd+A / Ctrl+A to select all tags
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        if (state.tags.length > 0) {
          e.preventDefault();
          selectAllTags();
          input?.select();
        }
        return;
      }

      // Handle selection mode: Backspace/Delete removes selected tags
      if (state.selectedTagIds.size > 0) {
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          if (state.inputValue) setInputValue("");
          removeSelectedTags();
          submit();
          return;
        }
        // Arrow keys deselect (navigation intent)
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          clearSelection();
          return;
        }
      }

      // Arrow down for suggestions navigation
      if (e.key === "ArrowDown") {
        if (state.isOpen && count > 0) {
          e.preventDefault();
          setActiveIndex(Math.min(state.activeIndex + 1, count - 1));
        }
        return;
      }

      // Arrow up for suggestions navigation
      if (e.key === "ArrowUp") {
        if (state.isOpen && count > 0) {
          e.preventDefault();
          setActiveIndex(Math.max(state.activeIndex - 1, 0));
        }
        return;
      }

      // Enter to select suggestion or submit
      if (e.key === "Enter") {
        e.preventDefault();
        if (state.isOpen && count > 0) {
          const suggestion = getSuggestionAtIndex(filters, state.inputValue, state.activeIndex);
          if (suggestion) {
            if (suggestion.type === "field") {
              setIsAddingTag(true);
              addTag(suggestion.filter.key);
            } else {
              setInputValue(`"${suggestion.value}"`);
              setIsOpen(false);
              submit();
            }
          }
        } else {
          setIsOpen(false);
          submit();
        }
        return;
      }

      // Escape to close suggestions or deselect
      if (e.key === "Escape") {
        if (state.selectedTagIds.size > 0) {
          clearSelection();
        } else {
          setIsOpen(false);
          input?.blur();
        }
        return;
      }

      // Arrow left to navigate to last tag (when cursor at position 0)
      if (e.key === "ArrowLeft") {
        if (input?.selectionStart === 0 && state.tags.length > 0) {
          e.preventDefault();
          const lastTag = state.tags[state.tags.length - 1];
          tagHandlesRef.current.get(lastTag.id)?.focusPosition("remove");
        }
        return;
      }

      // Backspace: remove last tag when input is empty (no tags selected)
      if (e.key === "Backspace" && state.inputValue === "" && state.tags.length > 0 && state.selectedTagIds.size === 0) {
        e.preventDefault();
        removeTag(state.tags[state.tags.length - 1].id);
        return;
      }
    },
    [
      mainInputRef,
      filters,
      state.inputValue,
      state.tags,
      state.selectedTagIds.size,
      state.isOpen,
      state.activeIndex,
      setInputValue,
      setIsOpen,
      setActiveIndex,
      selectAllTags,
      clearSelection,
      removeSelectedTags,
      removeTag,
      addTag,
      setIsAddingTag,
      submit,
    ]
  );

  const handleContainerClick = useCallback(() => mainInputRef.current?.focus(), [mainInputRef]);

  // Clear selection when focus leaves container
  const handleContainerBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget) && state.selectedTagIds.size > 0) {
        clearSelection();
      }
    },
    [state.selectedTagIds.size, clearSelection]
  );

  // Navigation helpers
  const handleNavigateToTag = useCallback(
    (index: number, position: "field" | "remove") => {
      if (index < 0 || index >= state.tags.length) return;
      tagHandlesRef.current.get(state.tags[index].id)?.focusPosition(position);
    },
    [state.tags]
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex items-center gap-2 px-2 rounded-md border border-input bg-transparent relative",
        "focus-within:ring-border/50 focus-within:ring-[3px] box-border",
        "not-focus-within:bg-accent transition duration-300 min-h-7 py-1",
        className
      )}
      onClick={handleContainerClick}
      onBlur={handleContainerBlur}
    >
      <Search className="text-secondary-foreground size-3.5 min-w-3.5 flex-shrink-0" />

      <div className="flex items-center gap-1 flex-wrap flex-1">
        {state.tags.map((tag, index) => (
          <FilterTag
            key={tag.id}
            ref={(handle) => {
              if (handle) tagHandlesRef.current.set(tag.id, handle);
              else tagHandlesRef.current.delete(tag.id);
            }}
            tag={tag}
            resource={resource}
            projectId={projectId}
            isFirst={index === 0}
            isLast={index === state.tags.length - 1}
            isSelected={state.selectedTagIds.has(tag.id)}
            onNavigateLeft={() => handleNavigateToTag(index - 1, "remove")}
            onNavigateRight={() => handleNavigateToTag(index + 1, "field")}
          />
        ))}

        <input
          ref={mainInputRef}
          type="text"
          value={state.inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={state.tags.length === 0 ? placeholder : ""}
          className={cn(
            "flex-1 min-w-[100px] h-6 bg-transparent text-xs outline-none",
            "placeholder:text-muted-foreground"
          )}
        />
      </div>

      <SuggestionsDropdown />
    </div>
  );
};

// URL-synced version
interface FilterSearchInputProps {
  filters: ColumnFilter[];
  resource?: "traces" | "spans";
  placeholder?: string;
  className?: string;
  additionalSearchParams?: Record<string, string | string[]>;
  onSubmit?: (filters: import("@/lib/actions/common/filters").Filter[], search: string) => void;
}

const PureFilterSearchInput = ({
  filters,
  resource = "traces",
  placeholder = "Search...",
  className,
  additionalSearchParams,
  onSubmit,
}: FilterSearchInputProps) => (
  <FilterSearchProvider
    filters={filters}
    mode="url"
    additionalSearchParams={additionalSearchParams}
    onSubmit={onSubmit}
  >
    <FilterSearchInputInner placeholder={placeholder} className={className} resource={resource} />
  </FilterSearchProvider>
);

interface StatefulFilterSearchInputProps {
  filters: ColumnFilter[];
  initialFilters?: import("@/lib/actions/common/filters").Filter[];
  resource?: "traces" | "spans";
  placeholder?: string;
  className?: string;
  onSubmit?: (filters: import("@/lib/actions/common/filters").Filter[], search: string) => void;
}

const PureStatefulFilterSearchInput = ({
  filters,
  initialFilters = [],
  resource = "traces",
  placeholder = "Search...",
  className,
  onSubmit,
}: StatefulFilterSearchInputProps) => (
  <StatefulFilterProvider initialFilters={initialFilters}>
    <FilterSearchProvider filters={filters} mode="stateful" onSubmit={onSubmit}>
      <FilterSearchInputInner placeholder={placeholder} className={className} resource={resource} />
    </FilterSearchProvider>
  </StatefulFilterProvider>
);

export const FilterSearchInput = memo(PureFilterSearchInput);
export const StatefulFilterSearchInput = memo(PureStatefulFilterSearchInput);
export { useFilterSearch, useStatefulFilters } from "./context";
export type { ColumnFilter, FilterTag } from "./types";
export default FilterSearchInput;
