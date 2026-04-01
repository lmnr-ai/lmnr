"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { type ChangeEvent, type FocusEvent, type KeyboardEvent, memo, useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { getSuggestionAtIndex, getSuggestionsCount } from "@/components/common/advanced-search/utils.ts";
import { Button } from "@/components/ui/button.tsx";
import { dataTypeOperationsMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { Operator } from "@/lib/actions/common/operators";
import { cn } from "@/lib/utils";

import { useAdvancedSearchContext, useAdvancedSearchNavigation, useAdvancedSearchRefsContext } from "../store";
import { createTagFromFilter } from "../types";
import FilterSuggestions from "./suggestions";
import FilterTag from "./tag";

interface FilterSearchInputProps {
  placeholder?: string;
  className?: string;
  resource?: "traces" | "spans";
  disableHotKey?: boolean;
  disabled?: boolean;
}

const FilterSearchInput = ({
  placeholder = "Search...",
  className,
  resource = "traces",
  disableHotKey,
  disabled,
}: FilterSearchInputProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tags = useAdvancedSearchContext((state) => state.tags);
  const inputValue = useAdvancedSearchContext((state) => state.inputValue);
  const isOpen = useAdvancedSearchContext((state) => state.isOpen);
  const activeIndex = useAdvancedSearchContext((state) => state.activeIndex);
  const activeRecentIndex = useAdvancedSearchContext((state) => state.activeRecentIndex);
  const selectedTagIds = useAdvancedSearchContext((state) => state.selectedTagIds);
  const openSelectId = useAdvancedSearchContext((state) => state.openSelectId);
  const filters = useAdvancedSearchContext((state) => state.filters);
  const autocompleteData = useAdvancedSearchContext((state) => state.autocompleteData);
  const activeTagId = useAdvancedSearchContext((state) => state.getActiveTagId());
  const recentSearches = useAdvancedSearchContext((state) => state.recentSearches);

  const {
    setInputValue,
    setIsOpen,
    setActiveIndex,
    setActiveRecentIndex,
    addTag,
    addCompleteTag,
    removeTag,
    selectAllTags,
    clearSelection,
    removeSelectedTags,
    submit,
    clearAll,
    setTags,
  } = useAdvancedSearchContext((state) => ({
    setInputValue: state.setInputValue,
    setIsOpen: state.setIsOpen,
    setActiveIndex: state.setActiveIndex,
    setActiveRecentIndex: state.setActiveRecentIndex,
    addTag: state.addTag,
    addCompleteTag: state.addCompleteTag,
    removeTag: state.removeTag,
    selectAllTags: state.selectAllTags,
    clearSelection: state.clearSelection,
    removeSelectedTags: state.removeSelectedTags,
    submit: state.submit,
    clearAll: state.clearAll,
    setTags: state.setTags,
  }));

  const { mainInputRef } = useAdvancedSearchRefsContext();
  const { navigateToTag, registerTagHandle } = useAdvancedSearchNavigation();

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (selectedTagIds.size > 0) {
        removeSelectedTags(router, pathname, searchParams);
      }
      setInputValue(e.target.value);
      setIsOpen(true);
    },
    [setInputValue, setIsOpen, selectedTagIds.size, removeSelectedTags, router, pathname, searchParams]
  );

  const handleInputBlur = useCallback(() => {
    if (activeTagId) return;
    if (openSelectId) return;
    setIsOpen(false);
    submit(router, pathname, searchParams);
  }, [activeTagId, openSelectId, setIsOpen, submit, router, pathname, searchParams]);

  const handleRecentSelect = useCallback(
    (index: number) => {
      const rs = recentSearches[index];
      if (!rs) return;
      const recentTags = rs.filters.map(createTagFromFilter);
      setTags(recentTags);
      setInputValue(rs.search);
      setIsOpen(false);
      setActiveIndex(-1);
      setActiveRecentIndex(-1);
      queueMicrotask(() => {
        submit(router, pathname, searchParams);
      });
    },
    [
      recentSearches,
      setTags,
      setInputValue,
      setIsOpen,
      setActiveIndex,
      setActiveRecentIndex,
      submit,
      router,
      pathname,
      searchParams,
    ]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      const input = mainInputRef.current;
      const count = getSuggestionsCount(filters, inputValue, autocompleteData);
      const showRecent = !inputValue.trim() && tags.length === 0 && recentSearches.length > 0;

      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        if (tags.length > 0) {
          e.preventDefault();
          selectAllTags();
          input?.select();
        }
        return;
      }

      // Handle selection mode
      if (selectedTagIds.size > 0) {
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          if (inputValue) setInputValue("");
          removeSelectedTags(router, pathname, searchParams);
          return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          clearSelection();
          return;
        }
      }

      // In recent row: left/right navigates chips, enter selects, down goes to suggestions, up goes to input
      if (activeRecentIndex >= 0 && showRecent) {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          setActiveRecentIndex(Math.min(activeRecentIndex + 1, recentSearches.length - 1));
          return;
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setActiveRecentIndex(Math.max(activeRecentIndex - 1, 0));
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          if (count > 0) {
            setActiveIndex(0);
          }
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setActiveRecentIndex(-1);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          handleRecentSelect(activeRecentIndex);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setActiveRecentIndex(-1);
          setIsOpen(false);
          input?.blur();
          return;
        }
        return;
      }

      // Arrow down
      if (e.key === "ArrowDown") {
        if (isOpen) {
          e.preventDefault();
          if (activeIndex === -1 && showRecent) {
            setActiveRecentIndex(0);
          } else if (count > 0) {
            setActiveIndex(Math.min(activeIndex + 1, count - 1));
          }
        }
        return;
      }

      // Arrow up
      if (e.key === "ArrowUp") {
        if (isOpen) {
          e.preventDefault();
          if (activeIndex === 0 && showRecent) {
            setActiveRecentIndex(0);
          } else if (activeIndex > 0) {
            setActiveIndex(activeIndex - 1);
          }
        }
        return;
      }

      // Enter
      if (e.key === "Enter") {
        e.preventDefault();
        if (isOpen && count > 0 && activeIndex >= 0) {
          const suggestion = getSuggestionAtIndex(filters, inputValue, activeIndex, autocompleteData);
          if (suggestion) {
            if (suggestion.type === "field") {
              addTag(suggestion.filter.key);
            } else if (suggestion.type === "value") {
              const columnFilter = filters.find((f) => f.key === suggestion.field);
              const defaultOperator = columnFilter
                ? (dataTypeOperationsMap[columnFilter.dataType]?.[0]?.key ?? Operator.Eq)
                : Operator.Eq;
              addCompleteTag(suggestion.field, defaultOperator, suggestion.value, router, pathname, searchParams);
            } else {
              setInputValue(suggestion.value);
              setIsOpen(false);
              submit(router, pathname, searchParams);
            }
          }
        } else {
          setIsOpen(false);
          submit(router, pathname, searchParams);
        }
        return;
      }

      // Escape
      if (e.key === "Escape") {
        if (selectedTagIds.size > 0) {
          clearSelection();
        } else {
          setIsOpen(false);
          input?.blur();
        }
        return;
      }

      // Arrow left
      if (e.key === "ArrowLeft") {
        if (input?.selectionStart === 0 && tags.length > 0) {
          e.preventDefault();
          const lastTag = tags[tags.length - 1];
          navigateToTag(lastTag.id, "remove");
        }
        return;
      }

      // Backspace
      if (e.key === "Backspace" && inputValue === "" && tags.length > 0 && selectedTagIds.size === 0) {
        e.preventDefault();
        removeTag(tags[tags.length - 1].id, router, pathname, searchParams);
        return;
      }
    },
    [
      mainInputRef,
      filters,
      inputValue,
      tags,
      selectedTagIds.size,
      isOpen,
      activeIndex,
      activeRecentIndex,
      autocompleteData,
      recentSearches,
      setInputValue,
      setIsOpen,
      setActiveIndex,
      setActiveRecentIndex,
      selectAllTags,
      clearSelection,
      removeSelectedTags,
      removeTag,
      addTag,
      addCompleteTag,
      setTags,
      submit,
      handleRecentSelect,
      navigateToTag,
      router,
      pathname,
      searchParams,
    ]
  );

  useHotkeys(
    "meta+k",
    (keyboardEvent: KeyboardEvent) => {
      keyboardEvent.preventDefault();
      mainInputRef.current?.focus();
    },
    { enabled: !disableHotKey }
  );

  const handleContainerBlur = useCallback(
    (e: FocusEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget) && selectedTagIds.size > 0) {
        clearSelection();
      }
    },
    [selectedTagIds.size, clearSelection]
  );

  const hasContent = tags.length > 0 || inputValue.length > 0;

  return (
    <div
      className={cn(
        "flex items-start gap-2 px-1 rounded-md border border-input relative",
        "bg-muted/80 transition duration-250 py-0.75",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
      onClick={() => mainInputRef.current?.focus()}
      onBlur={handleContainerBlur}
    >
      <span className="py-1 pl-1">
        <Search className="text-secondary-foreground size-3.5 mt-0.25 shrink-0" />
      </span>
      <div className="flex items-center gap-1 flex-wrap flex-1">
        {tags.map((tag) => (
          <FilterTag
            key={tag.id}
            ref={(handle) => registerTagHandle(tag.id, handle)}
            tag={tag}
            resource={resource}
            isSelected={selectedTagIds.has(tag.id)}
          />
        ))}

        <input
          ref={mainInputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={tags.length === 0 ? placeholder : ""}
          className={cn(
            "flex-1 min-w-[100px] h-6 bg-transparent text-xs outline-none",
            "placeholder:text-muted-foreground"
          )}
        />
      </div>
      {hasContent && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => clearAll(router, pathname, searchParams)}
          className="text-secondary-foreground h-6 px-1 py-1 w-fit hover:bg-muted"
          aria-label="Clear all filters"
        >
          <X className="size-4" />
        </Button>
      )}
      {!disableHotKey && (
        <kbd className="text-secondary-foreground pointer-events-none inline-flex h-6 w-6 items-center justify-center rounded-sm px-1 font-sans text-xs font-medium select-none">
          ⌘K
        </kbd>
      )}
      <FilterSuggestions />
    </div>
  );
};

FilterSearchInput.displayName = "FilterSearchInput";

export default memo(FilterSearchInput);
