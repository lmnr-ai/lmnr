"use client";

import { Search, X } from "lucide-react";
import React, { ChangeEvent, FocusEvent, KeyboardEvent, memo, useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { getSuggestionAtIndex, getSuggestionsCount } from "@/components/common/advanced-search/utils.ts";
import { Button } from "@/components/ui/button.tsx";
import { Operator } from "@/lib/actions/common/operators";
import { cn } from "@/lib/utils";

import { useAutocompleteData, useFilterSearch } from "../context";
import FilterSuggestions from "./suggestions";
import FilterTag from "./tag";

interface FilterSearchInputProps {
  placeholder?: string;
  className?: string;
  resource?: "traces" | "spans";
}

const FilterSearchInput = ({ placeholder = "Search...", className, resource = "traces" }: FilterSearchInputProps) => {
  const {
    state,
    filters,
    activeTagId,
    setInputValue,
    setIsOpen,
    setActiveIndex,
    removeTag,
    mainInputRef,
    submit,
    addTag,
    addCompleteTag,
    selectAllTags,
    clearSelection,
    removeSelectedTags,
    clearAll,
    registerTagHandle,
    navigateToTag,
  } = useFilterSearch();

  const { data } = useAutocompleteData();
  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (state.selectedTagIds.size > 0) {
        removeSelectedTags();
      }
      setInputValue(e.target.value);
      setIsOpen(true);
    },
    [setInputValue, setIsOpen, state.selectedTagIds.size, removeSelectedTags]
  );

  const handleInputBlur = useCallback(() => {
    // Don't close if there's an active tag (focus is transferring to it)
    if (activeTagId) return;
    if (state.openSelectId) return;
    setIsOpen(false);
    // Submit is handled by tag blur or explicit actions (Enter, removeTag, etc.)
  }, [setIsOpen, activeTagId, state.openSelectId]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      const input = mainInputRef.current;
      const count = getSuggestionsCount(filters, state.inputValue, data);

      // Cmd+A / Ctrl+A to select all tags
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        if (state.tags.length > 0) {
          e.preventDefault();
          selectAllTags();
          input?.select();
        }
        return;
      }

      // Handle selection mode
      if (state.selectedTagIds.size > 0) {
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          if (state.inputValue) setInputValue("");
          removeSelectedTags();
          // submit is called internally by removeSelectedTags
          return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          clearSelection();
          return;
        }
      }

      // Arrow down
      if (e.key === "ArrowDown") {
        if (state.isOpen && count > 0) {
          e.preventDefault();
          setActiveIndex(Math.min(state.activeIndex + 1, count - 1));
        }
        return;
      }

      // Arrow up
      if (e.key === "ArrowUp") {
        if (state.isOpen && count > 0) {
          e.preventDefault();
          setActiveIndex(Math.max(state.activeIndex - 1, 0));
        }
        return;
      }

      // Enter
      if (e.key === "Enter") {
        e.preventDefault();
        if (state.isOpen && count > 0 && state.activeIndex >= 0) {
          const suggestion = getSuggestionAtIndex(filters, state.inputValue, state.activeIndex, data);
          if (suggestion) {
            if (suggestion.type === "field") {
              addTag(suggestion.filter.key);
            } else if (suggestion.type === "value") {
              addCompleteTag(suggestion.field, Operator.Eq, suggestion.value);
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

      // Escape
      if (e.key === "Escape") {
        if (state.selectedTagIds.size > 0) {
          clearSelection();
        } else {
          setIsOpen(false);
          input?.blur();
        }
        return;
      }

      // Arrow left
      if (e.key === "ArrowLeft") {
        if (input?.selectionStart === 0 && state.tags.length > 0) {
          e.preventDefault();
          const lastTag = state.tags[state.tags.length - 1];
          navigateToTag(lastTag.id, "remove");
        }
        return;
      }

      // Backspace
      if (
        e.key === "Backspace" &&
        state.inputValue === "" &&
        state.tags.length > 0 &&
        state.selectedTagIds.size === 0
      ) {
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
      addCompleteTag,
      submit,
      data,
      navigateToTag,
    ]
  );

  useHotkeys("meta+k", () => mainInputRef.current?.focus());

  const handleContainerBlur = useCallback(
    (e: FocusEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget) && state.selectedTagIds.size > 0) {
        clearSelection();
      }
    },
    [state.selectedTagIds.size, clearSelection]
  );

  const hasContent = state.tags.length > 0 || state.inputValue.length > 0;

  return (
    <div
      className={cn(
        "flex items-start gap-2 px-1 rounded-md border border-input relative",
        "bg-muted/80 transition duration-250 py-0.75",
        className
      )}
      onClick={() => mainInputRef.current?.focus()}
      onBlur={handleContainerBlur}
    >
      <span className="p-1">
        <Search className="text-secondary-foreground size-4 shrink-0" />
      </span>

      <div className="flex items-center gap-2 flex-wrap flex-1">
        {state.tags.map((tag) => (
          <FilterTag
            key={tag.id}
            ref={(handle) => registerTagHandle(tag.id, handle)}
            tag={tag}
            resource={resource}
            isSelected={state.selectedTagIds.has(tag.id)}
          />
        ))}

        <input
          ref={mainInputRef}
          type="text"
          value={state.inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={state.tags.length === 0 ? placeholder : ""}
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
          onClick={clearAll}
          className="text-secondary-foreground h-6 px-1 py-1 w-fit hover:bg-muted"
          aria-label="Clear all filters"
        >
          <X className="size-4" />
        </Button>
      )}
      <kbd className="text-secondary-foreground pointer-events-none inline-flex h-6 w-6 items-center justify-center rounded-sm px-1 font-sans text-xs font-medium select-none">
        ⌘K
      </kbd>
      <FilterSuggestions />
    </div>
  );
};

FilterSearchInput.displayName = "FilterSearchInput";

export default memo(FilterSearchInput);
