"use client";

import { Search } from "lucide-react";
import { useParams } from "next/navigation";
import {ChangeEvent,KeyboardEvent, memo, useCallback, useRef} from "react";

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
  } = useFilterSearch();

  const tagHandlesRef = useRef<Map<string, FilterTagHandle>>(new Map());

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
      setIsOpen(true);
    },
    [setInputValue, setIsOpen]
  );

  const handleInputFocus = useCallback(() => {
    setIsOpen(true);
  }, [setIsOpen]);

  const handleInputBlur = useCallback(() => {
    setTimeout(() => {
      // Don't submit if we're adding a tag
      if (state.isAddingTag) return;

      setIsOpen(false);
      submit();
    }, 150);
  }, [setIsOpen, submit, state.isAddingTag]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      const suggestionsCount = getSuggestionsCount(filters, state.inputValue);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (state.isOpen && suggestionsCount > 0) {
          setActiveIndex(Math.min(state.activeIndex + 1, suggestionsCount - 1));
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (state.isOpen && suggestionsCount > 0) {
          setActiveIndex(Math.max(state.activeIndex - 1, 0));
        }
      } else if (e.key === "ArrowLeft") {
        const input = mainInputRef.current;
        if (input && input.selectionStart === 0 && state.tags.length > 0) {
          e.preventDefault();
          const lastTag = state.tags[state.tags.length - 1];
          const handle = tagHandlesRef.current.get(lastTag.id);
          if (handle) {
            handle.focusPosition("remove");
          }
        }
      } else if (e.key === "Backspace" && state.inputValue === "" && state.tags.length > 0) {
        e.preventDefault();
        const lastTag = state.tags[state.tags.length - 1];
        removeTag(lastTag.id);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (state.isOpen && suggestionsCount > 0) {
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
      } else if (e.key === "Escape") {
        setIsOpen(false);
        mainInputRef.current?.blur();
      }
    },
    [
      state.isOpen,
      state.activeIndex,
      state.inputValue,
      state.tags,
      filters,
      setActiveIndex,
      setIsOpen,
      submit,
      removeTag,
      mainInputRef,
      addTag,
      setInputValue,
      setIsAddingTag,
    ]
  );

  const handleContainerClick = useCallback(() => {
    mainInputRef.current?.focus();
  }, [mainInputRef]);

  // Navigation handlers for tags
  const handleNavigateToTag = useCallback(
    (tagIndex: number, position: "field" | "remove") => {
      if (tagIndex < 0 || tagIndex >= state.tags.length) return;
      const tag = state.tags[tagIndex];
      const handle = tagHandlesRef.current.get(tag.id);
      if (handle) {
        handle.focusPosition(position);
      }
    },
    [state.tags]
  );

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 rounded-md border border-input bg-transparent relative",
        "focus-within:ring-border/50 focus-within:ring-[3px] box-border",
        "not-focus-within:bg-accent transition duration-300 min-h-7 py-1",
        className
      )}
      onClick={handleContainerClick}
    >
      <Search className="text-secondary-foreground size-3.5 min-w-3.5 flex-shrink-0" />

      <div className="flex items-center gap-1 flex-wrap flex-1">
        {state.tags.map((tag, index) => (
          <FilterTag
            key={tag.id}
            ref={(handle) => {
              if (handle) {
                tagHandlesRef.current.set(tag.id, handle);
              } else {
                tagHandlesRef.current.delete(tag.id);
              }
            }}
            tag={tag}
            resource={resource}
            projectId={projectId}
            isFirst={index === 0}
            isLast={index === state.tags.length - 1}
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
    resource={resource}
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
    <FilterSearchProvider filters={filters} mode="stateful" resource={resource} onSubmit={onSubmit}>
      <FilterSearchInputInner placeholder={placeholder} className={className} resource={resource} />
    </FilterSearchProvider>
  </StatefulFilterProvider>
);

export const FilterSearchInput = memo(PureFilterSearchInput);
export const StatefulFilterSearchInput = memo(PureStatefulFilterSearchInput);
export { useFilterSearch, useStatefulFilters } from "./context";
export type { ColumnFilter, FilterTag } from "./types";
export default FilterSearchInput;
