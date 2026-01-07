"use client";

import { Search } from "lucide-react";
import { useParams } from "next/navigation";
import { ChangeEvent, FocusEvent, memo, useCallback, useRef } from "react";

import { cn } from "@/lib/utils";

import { useFilterSearch } from "../context";
import { FilterTagRef } from "../types";
import FilterSuggestions, { getSuggestionAtIndex, getSuggestionsCount } from "./filter-suggestions";
import FilterTag from "./filter-tag";

interface FilterSearchInputProps {
  placeholder?: string;
  className?: string;
  resource?: "traces" | "spans";
}

const FilterSearchInput = ({ placeholder = "Search...", className, resource = "traces" }: FilterSearchInputProps) => {
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

  const tagHandlesRef = useRef<Map<string, FilterTagRef>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

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

  const handleInputFocus = useCallback(() => setIsOpen(true), [setIsOpen]);

  const handleInputBlur = useCallback(() => {
    if (state.activeTagId) return;
    if (state.isAddingTag) return;
    if (state.openSelectId) return;
    setIsOpen(false);
    submit();
  }, [setIsOpen, submit, state.isAddingTag, state.activeTagId, state.openSelectId]);

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

      // Handle selection mode
      if (state.selectedTagIds.size > 0) {
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          if (state.inputValue) setInputValue("");
          removeSelectedTags();
          submit();
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
          tagHandlesRef.current.get(lastTag.id)?.focusPosition("remove");
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
      state.activeTagId,
      state.isAddingTag,
      state.openSelectId,
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

  const handleContainerBlur = useCallback(
    (e: FocusEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget) && state.selectedTagIds.size > 0) {
        clearSelection();
      }
    },
    [state.selectedTagIds.size, clearSelection]
  );

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
        "flex items-center gap-2 px-2 rounded-md border border-input bg-transparent relative py-1",
        "focus-within:ring-primary/80 focus-within:ring-[1px] transition duration-300",
        // "not-focus-within:bg-accent ",
        className
      )}
      onClick={handleContainerClick}
      onBlur={handleContainerBlur}
    >
      <Search className="text-secondary-foreground size-4 min-w-4 flex-shrink-0" />

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
            "flex-1 min-w-[100px] h-6 bg-transparent text-sm outline-none",
            "placeholder:text-muted-foreground"
          )}
        />
      </div>

      <FilterSuggestions />
    </div>
  );
};

FilterSearchInput.displayName = "FilterSearchInput";

export default memo(FilterSearchInput);
