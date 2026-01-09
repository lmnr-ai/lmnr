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

import {
  createEditFocusState,
  createNavFocusState,
  getNextField,
  getPreviousField,
} from "@/components/common/advanced-search/utils";
import { Button } from "@/components/ui/button";
import { AUTOCOMPLETE_FIELDS } from "@/lib/actions/autocomplete/fields";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { cn } from "@/lib/utils";

import { useFilterSearch } from "../context";
import ValueInput from "../inputs";
import { FilterTag as FilterTagType, FilterTagRef, FocusableRef, getColumnFilter, TagFocusPosition } from "../types";
import FilterSelect from "./select";

interface FilterTagProps {
  tag: FilterTagType;
  resource?: "traces" | "spans";
  projectId: string;
  isSelected?: boolean;
  ref?: Ref<FilterTagRef>;
}

const FilterTag = ({
  tag,
  resource = "traces",
  projectId,
  isSelected = false,
  ref,
}: FilterTagProps) => {
  const {
    filters,
    removeTag,
    submit,
    state,
    focusMainInput,
    setIsAddingTag,
    setActiveTagId,
    setTagFocusState,
    getTagFocusState,
    autocompleteData,
    navigateToPreviousTag,
    navigateToNextTag,
  } = useFilterSearch();

  const containerRef = useRef<HTMLDivElement>(null);
  const fieldSelectRef = useRef<FocusableRef>(null);
  const operatorSelectRef = useRef<FocusableRef>(null);
  const valueInputRef = useRef<FocusableRef>(null);
  const removeRef = useRef<HTMLButtonElement>(null);

  const focusState = getTagFocusState(tag.id);
  const debouncedValue = useDebounce(tag.value, 300);

  const columnFilter = getColumnFilter(filters, tag.field);
  const dataType = columnFilter?.dataType || "string";

  useImperativeHandle(ref, () => ({
    focusPosition: (position: TagFocusPosition) => {
      containerRef.current?.focus();
      setTagFocusState(tag.id, {
        type: position,
        mode: "nav",
        isOpen: false,
        showSuggestions: false,
        isSelectOpen: false,
      });
    },
  }));

  // Check if field supports autocomplete
  const supportsAutocomplete = useMemo(
    () => AUTOCOMPLETE_FIELDS[resource]?.includes(tag.field) ?? false,
    [resource, tag.field]
  );

  // Get value suggestions from preloaded autocomplete data
  const filteredValueSuggestions = useMemo(() => {
    if (dataType !== "string" || !supportsAutocomplete) return [];

    const preloadedValues = autocompleteData.get(tag.field) || [];

    if (!debouncedValue) {
      return preloadedValues;
    }

    // Filter in-memory based on debounced value
    const lowerQuery = debouncedValue.toLowerCase();
    return preloadedValues.filter((value) => value.toLowerCase().includes(lowerQuery));
  }, [autocompleteData, tag.field, debouncedValue, dataType, supportsAutocomplete]);

  useEffect(() => {
    if (state.activeTagId === tag.id && state.isAddingTag) {
      setTagFocusState(tag.id, { type: "value", mode: "edit", showSuggestions: false, isSelectOpen: false });
      valueInputRef.current?.focus();
      setIsAddingTag(false);
    }
  }, [state.activeTagId, state.isAddingTag, tag.id, setIsAddingTag, setTagFocusState]);

  const handleBlur = useCallback(
    (e: FocusEvent) => {
      if (!containerRef.current?.contains(e.relatedTarget as Node)) {
        setTagFocusState(tag.id, { type: "idle" });
        setActiveTagId(null);
        submit();
      }
    },
    [tag.id, submit, setActiveTagId, setTagFocusState]
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

  const handleRemoveClick = useCallback(() => {
    setActiveTagId(tag.id);
    removeRef.current?.focus();
    setTagFocusState(tag.id, { type: "remove", mode: "edit" });
  }, [tag.id, setActiveTagId, setTagFocusState]);

  const handleExitEditLeft = useCallback(() => {
    if (focusState.type === "idle") return;

    const prevField = getPreviousField(focusState.type);

    if (prevField) {
      setTagFocusState(tag.id, createNavFocusState(prevField));
      containerRef.current?.focus();
    } else {
      // At leftmost field, navigate to previous tag
      navigateToPreviousTag(tag.id);
    }
  }, [focusState.type, navigateToPreviousTag, tag.id, setTagFocusState]);

  const handleExitEditRight = useCallback(() => {
    if (focusState.type === "idle") return;

    const nextField = getNextField(focusState.type);

    if (nextField) {
      setTagFocusState(tag.id, createNavFocusState(nextField));
      containerRef.current?.focus();
    } else {
      navigateToNextTag(tag.id);
    }
  }, [focusState.type, navigateToNextTag, tag.id, setTagFocusState]);

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

      if (e.key === "Enter" && "mode" in focusState && focusState.mode === "nav") {
        e.preventDefault();
        handleEnterKey(e);
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        handleEscapeKey();
        return;
      }

      if ("mode" in focusState && focusState.mode === "nav") {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          handleExitEditRight();
          return;
        }

        if (e.key === "ArrowLeft") {
          e.preventDefault();
          handleExitEditLeft();
          return;
        }
      }
    },
    [focusState, handleExitEditLeft, handleExitEditRight, handleEnterKey, handleEscapeKey]
  );

  if (!columnFilter) return null;

  const removeButtonClassName = cn(
    "h-6 w-6 p-0 rounded-l-none rounded-r-md transition-colors outline-none border-0",
    focusState.type === "remove" && "mode" in focusState && focusState.mode === "nav" && "bg-accent/50"
  );

  return (
    <div
      ref={containerRef}
      tabIndex={focusState.type !== "idle" && "mode" in focusState && focusState.mode === "nav" ? 0 : -1}
      className={cn(
        "inline-flex items-center rounded-md border bg-secondary h-6",
        "divide-x divide-input transition-all outline-none",
        "data-[selected=true]:border-primary data-[selected=true]:ring-2 data-[selected=true]:ring-primary/30"
      )}
      data-selected={isSelected}
      onKeyDown={handleContainerKeyDown}
      onBlur={handleBlur}
    >
      <FilterSelect
        ref={fieldSelectRef}
        tagId={tag.id}
        selectType="field"
      />

      <FilterSelect
        ref={operatorSelectRef}
        tagId={tag.id}
        selectType="operator"
      />

      <ValueInput
        tagId={tag.id}
        columnFilter={columnFilter}
        suggestions={filteredValueSuggestions}
        focused={focusState.type === "value" && "mode" in focusState && focusState.mode === "edit"}
        ref={valueInputRef}
        mode={focusState.type === "value" && "mode" in focusState ? focusState.mode : "nav"}
      />

      <Button
        variant="ghost"
        ref={removeRef}
        onClick={handleRemove}
        onMouseDown={handleRemoveClick}
        tabIndex={focusState.type === "remove" && "mode" in focusState && focusState.mode === "edit" ? 0 : -1}
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
