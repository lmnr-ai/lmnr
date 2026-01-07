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
import useSWR from "swr";

import {
  createEditFocusState,
  createNavFocusState,
  getNextField,
  getPreviousField,
} from "@/components/common/advanced-search/utils";
import { Button } from "@/components/ui/button";
import { AutocompleteSuggestion } from "@/lib/actions/autocomplete";
import { AUTOCOMPLETE_FIELDS } from "@/lib/actions/autocomplete/fields";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { cn, swrFetcher } from "@/lib/utils";

import { useFilterSearch } from "../context";
import ValueInput from "../inputs";
import { FilterTag as FilterTagType, FilterTagRef, FocusableRef, getColumnFilter, TagFocusPosition } from "../types";
import FilterSelect from "./filter-select";

interface FilterTagProps {
  tag: FilterTagType;
  resource?: "traces" | "spans";
  projectId: string;
  isFirst: boolean;
  isLast: boolean;
  isSelected?: boolean;
  onNavigateLeft: () => void;
  onNavigateRight: () => void;
  ref?: Ref<FilterTagRef>;
}

const FilterTag = ({
  tag,
  resource = "traces",
  projectId,
  isFirst,
  isLast,
  isSelected = false,
  onNavigateLeft,
  onNavigateRight,
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

  // Fetch value suggestions (only in edit mode for string fields)
  const fetchUrl = useMemo(() => {
    if (focusState.type !== "value" || dataType !== "string" || !supportsAutocomplete) return null;
    if (!("mode" in focusState) || focusState.mode !== "edit") return null;
    const params = new URLSearchParams({ field: tag.field });
    if (debouncedValue) {
      params.set("prefix", debouncedValue);
    }
    return `/api/projects/${projectId}/${resource}/autocomplete?${params.toString()}`;
  }, [debouncedValue, focusState, projectId, resource, dataType, supportsAutocomplete, tag.field]);

  const { data: suggestions = { suggestions: [] } } = useSWR<{ suggestions: AutocompleteSuggestion[] }>(
    fetchUrl,
    swrFetcher,
    { fallbackData: { suggestions: [] }, keepPreviousData: true }
  );

  const filteredValueSuggestions = useMemo(
    () => suggestions.suggestions.map((s) => s.value),
    [suggestions.suggestions]
  );

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
    } else if (!isFirst) {
      // At leftmost field, navigate to previous tag
      onNavigateLeft();
    }
  }, [focusState.type, isFirst, onNavigateLeft, tag.id, setTagFocusState]);

  const handleExitEditRight = useCallback(() => {
    if (focusState.type === "idle") return;

    const nextField = getNextField(focusState.type);

    if (nextField) {
      setTagFocusState(tag.id, createNavFocusState(nextField));
      containerRef.current?.focus();
    } else if (isLast) {
      // At rightmost field, go to main input
      focusMainInput();
    } else {
      // Navigate to next tag
      onNavigateRight();
    }
  }, [focusState.type, isLast, focusMainInput, onNavigateRight, tag.id, setTagFocusState]);

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
        onNavigateLeft={handleExitEditLeft}
        onNavigateRight={handleExitEditRight}
      />

      <FilterSelect
        ref={operatorSelectRef}
        tagId={tag.id}
        selectType="operator"
        onNavigateLeft={handleExitEditLeft}
        onNavigateRight={handleExitEditRight}
      />

      <ValueInput
        tagId={tag.id}
        columnFilter={columnFilter}
        suggestions={filteredValueSuggestions}
        focused={focusState.type === "value" && "mode" in focusState && focusState.mode === "edit"}
        onExitEditLeft={handleExitEditLeft}
        onExitEditRight={handleExitEditRight}
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
