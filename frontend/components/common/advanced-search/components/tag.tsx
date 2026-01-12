"use client";

import { X } from "lucide-react";
import {
  FocusEvent,
  KeyboardEvent,
  memo,
  MouseEvent,
  Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

import { createEditFocusState } from "@/components/common/advanced-search/utils";
import { Button } from "@/components/ui/button";
import { AUTOCOMPLETE_FIELDS } from "@/lib/actions/autocomplete/fields";
import { cn } from "@/lib/utils";

import { useAutocompleteData, useFilterSearch } from "../context";
import ValueInput from "../inputs";
import { FilterTag as FilterTagType, FilterTagRef, FocusableRef, getColumnFilter, TagFocusPosition } from "../types";
import FilterSelect from "./select";

interface FilterTagProps {
  tag: FilterTagType;
  resource?: "traces" | "spans";
  isSelected?: boolean;
  ref?: Ref<FilterTagRef>;
}

const FilterTag = ({ tag, resource = "traces", isSelected = false, ref }: FilterTagProps) => {
  const { filters, removeTag, submit, focusMainInput, setTagFocusState, getTagFocusState, navigateWithinTag } =
    useFilterSearch();

  const { data } = useAutocompleteData();

  const containerRef = useRef<HTMLDivElement>(null);
  const fieldSelectRef = useRef<FocusableRef>(null);
  const operatorSelectRef = useRef<FocusableRef>(null);
  const valueInputRef = useRef<FocusableRef>(null);
  const removeRef = useRef<HTMLButtonElement>(null);

  const focusState = getTagFocusState(tag.id);

  const columnFilter = getColumnFilter(filters, tag.field);
  const dataType = columnFilter?.dataType || "string";

  useImperativeHandle(ref, () => ({
    focusPosition: (position: TagFocusPosition) => {
      containerRef.current?.focus();
      setTagFocusState(tag.id, {
        type: position,
        mode: "nav",
      });
    },
  }));

  const filteredValueSuggestions = useMemo(() => {
    if (dataType !== "string" || !AUTOCOMPLETE_FIELDS[resource]?.includes(tag.field)) return [];

    const preloadedValues = data.get(tag.field) || [];

    if (!tag.value) {
      return preloadedValues;
    }

    const lowerQuery = tag.value.toLowerCase();
    return preloadedValues.filter((value) => value.toLowerCase().includes(lowerQuery));
  }, [dataType, resource, tag.field, tag.value, data]);

  useEffect(() => {
    if (focusState.type !== "idle" && "mode" in focusState && focusState.mode === "edit") {
      const refMap = {
        field: fieldSelectRef,
        operator: operatorSelectRef,
        value: valueInputRef,
        remove: removeRef,
      };
      refMap[focusState.type]?.current?.focus();
    }
  }, [focusState]);

  const handleBlur = useCallback(
    (e: FocusEvent) => {
      if (!containerRef.current?.contains(e.relatedTarget as Node)) {
        setTagFocusState(tag.id, { type: "idle" });
      }
    },
    [tag.id, setTagFocusState]
  );

  const handleRemove = useCallback(
    (e: MouseEvent | KeyboardEvent) => {
      e.stopPropagation();
      if ("key" in e && e.key !== "Enter" && e.key !== " ") return;
      removeTag(tag.id);
      focusMainInput();
    },
    [removeTag, tag.id, focusMainInput]
  );

  const handleRemoveClick = useCallback(() => {
    removeRef.current?.focus();
    setTagFocusState(tag.id, { type: "remove", mode: "edit" });
  }, [tag.id, setTagFocusState]);

  const handleEnterKey = useCallback(
    (e: KeyboardEvent) => {
      if (focusState.type === "idle") return;

      const openDropdown = focusState.type === "field" || focusState.type === "operator";
      setTagFocusState(tag.id, createEditFocusState(focusState.type, openDropdown));

      // Focus the appropriate ref
      const refMap = {
        field: fieldSelectRef,
        operator: operatorSelectRef,
        value: valueInputRef,
        remove: removeRef,
      };

      if (focusState.type === "remove") {
        handleRemove(e);
      } else {
        refMap[focusState.type]?.current?.focus();
      }
    },
    [focusState.type, tag.id, setTagFocusState, handleRemove]
  );

  const handleEscapeKey = useCallback(() => {
    if ("mode" in focusState && focusState.mode === "edit") {
      setTagFocusState(tag.id, { ...focusState, mode: "nav", isOpen: false } as any);
      containerRef.current?.focus();
    } else {
      setTagFocusState(tag.id, { type: "idle" });
      focusMainInput();
    }
  }, [focusState, tag.id, setTagFocusState, focusMainInput]);

  // Container keyboard handler for nav mode and Enter/Escape
  const handleContainerKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (focusState.type === "idle") return;

      // Handle Enter key
      if (e.key === "Enter") {
        // Always handle Enter on remove button (regardless of mode)
        if (focusState.type === "remove") {
          e.preventDefault();
          handleRemove(e);
          return;
        }
        // Handle Enter in nav mode for other focus types
        if ("mode" in focusState && focusState.mode === "nav") {
          e.preventDefault();
          handleEnterKey(e);
          return;
        }
      }

      if (e.key === "Escape") {
        e.preventDefault();
        handleEscapeKey();
        return;
      }

      if ("mode" in focusState && focusState.mode === "nav") {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          navigateWithinTag(tag.id, "right");
          return;
        }

        if (e.key === "ArrowLeft") {
          e.preventDefault();
          navigateWithinTag(tag.id, "left");
          return;
        }
      }
    },
    [focusState, handleEnterKey, handleEscapeKey, handleRemove, navigateWithinTag, tag.id]
  );

  if (!columnFilter) return null;

  const removeButtonClassName = cn(
    "h-6 w-6 p-0 rounded-l-none rounded-r-md transition-colors outline-none border-0",
    focusState.type === "remove" && "bg-accent"
  );

  return (
    <div
      ref={containerRef}
      tabIndex={focusState.type !== "idle" && focusState.mode === "nav" ? 0 : -1}
      className={cn(
        "inline-flex items-center rounded-md border bg-secondary h-6",
        "divide-x divide-input transition-all outline-none",
        "data-[selected=true]:border-primary data-[selected=true]:ring-1 data-[selected=true]:ring-primary/30"
      )}
      data-selected={isSelected}
      onKeyDown={handleContainerKeyDown}
      onBlur={handleBlur}
    >
      <FilterSelect ref={fieldSelectRef} tagId={tag.id} selectType="field" />

      <FilterSelect ref={operatorSelectRef} tagId={tag.id} selectType="operator" />

      <ValueInput
        tagId={tag.id}
        columnFilter={columnFilter}
        suggestions={filteredValueSuggestions}
        focused={focusState.type === "value" && "mode" in focusState && focusState.mode === "edit"}
        ref={valueInputRef}
        mode={focusState.type === "idle" ? "nav" : focusState.mode}
      />

      <Button
        variant="ghost"
        ref={removeRef}
        onClick={handleRemove}
        onMouseDown={handleRemoveClick}
        className={removeButtonClassName}
        type="button"
      >
        <X className="w-3 h-3 text-secondary-foreground" />
      </Button>
    </div>
  );
};

FilterTag.displayName = "FilterTag";

export default memo(FilterTag);
