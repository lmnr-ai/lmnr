"use client";

import { X } from "lucide-react";
import {
  type FocusEvent,
  type KeyboardEvent,
  memo,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";

import { Button } from "@/components/ui/button";
import { OperatorLabelMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { AUTOCOMPLETE_FIELDS } from "@/lib/actions/autocomplete/fields";
import { cn } from "@/lib/utils";

import ValueInput from "../inputs";
import {
  useAdvancedSearchContext,
  useAdvancedSearchNavigation,
  useAdvancedSearchRefsContext,
  useTagFocus,
} from "../store";
import {
  type AdvancedSearchResource,
  type ColumnFilter,
  type FilterTag as FilterTagType,
  type FocusableRef,
  getColumnFilter,
  type TagFocusPosition,
} from "../types";
import { displayFilterValue } from "../utils";
import FilterSelect from "./select";

interface FilterTagProps {
  tag: FilterTagType;
  resource?: AdvancedSearchResource;
  isSelected?: boolean;
}

const FilterTag = ({ tag, resource = "traces", isSelected = false }: FilterTagProps) => {
  const filters = useAdvancedSearchContext((state) => state.filters);
  const autocompleteData = useAdvancedSearchContext((state) => state.autocompleteData);

  const { removeTag, setFocus, clearFocus, selectAllTags } = useAdvancedSearchContext((state) => ({
    removeTag: state.removeTag,
    setFocus: state.setFocus,
    clearFocus: state.clearFocus,
    selectAllTags: state.selectAllTags,
  }));
  const focus = useTagFocus(tag.id);

  const { mainInputRef } = useAdvancedSearchRefsContext();

  const { navigateWithinTag, registerTagHandle } = useAdvancedSearchNavigation();

  const containerRef = useRef<HTMLDivElement>(null);
  const fieldSelectRef = useRef<FocusableRef>(null);
  const operatorSelectRef = useRef<FocusableRef>(null);
  const valueInputRef = useRef<FocusableRef>(null);
  const removeRef = useRef<HTMLButtonElement>(null);

  // A filter coming from a shared URL may reference a column the current user
  // hasn't configured (e.g. someone else's `custom:*` column). Synthesize a
  // fallback so the tag stays visible and removable instead of silently vanishing.
  const columnFilter: ColumnFilter = getColumnFilter(filters, tag.field) ?? {
    name: tag.field,
    key: tag.field,
    dataType: tag.dataType ?? "string",
  };
  const dataType = columnFilter.dataType;

  // Include operator + value so several filters on the SAME column get distinct
  // remove-button names (e.g. "Remove metadata = foo filter"); fall back to the
  // bare name while the tag is still being built and has no value yet.
  const valueText = displayFilterValue(columnFilter, tag.value);
  const removeLabel = valueText
    ? `Remove ${columnFilter.name} ${OperatorLabelMap[tag.operator]} ${valueText} filter`
    : `Remove ${columnFilter.name} filter`;

  const focusMainInput = useCallback(() => {
    mainInputRef.current?.focus();
    clearFocus(tag.id);
  }, [mainInputRef, tag.id, clearFocus]);

  const focusPosition = useCallback(
    (position: TagFocusPosition) => {
      containerRef.current?.focus();
      setFocus({ tagId: tag.id, position, mode: "nav" });
    },
    [tag.id, setFocus]
  );

  useEffect(() => {
    registerTagHandle(tag.id, { focusPosition });
    return () => registerTagHandle(tag.id, null);
  }, [tag.id, focusPosition, registerTagHandle]);

  const filteredValueSuggestions = useMemo(() => {
    if ((dataType !== "string" && dataType !== "array") || !AUTOCOMPLETE_FIELDS[resource]?.includes(tag.field))
      return [];

    const preloadedValues = autocompleteData.get(tag.field) || [];

    // For array type, don't filter here - TagInput handles filtering internally
    if (dataType === "array") {
      return preloadedValues;
    }

    if (!tag.value || Array.isArray(tag.value)) {
      return preloadedValues;
    }

    const lowerQuery = tag.value.toLowerCase();
    return preloadedValues.filter((value) => value.toLowerCase().includes(lowerQuery));
  }, [dataType, resource, tag.field, tag.value, autocompleteData]);

  useEffect(() => {
    if (focus?.mode !== "edit") return;
    const partRefs = { field: fieldSelectRef, operator: operatorSelectRef, value: valueInputRef, remove: removeRef };
    partRefs[focus.position].current?.focus();
  }, [focus]);

  const handleBlur = useCallback(
    (e: FocusEvent) => {
      if (!containerRef.current?.contains(e.relatedTarget as Node)) clearFocus(tag.id);
    },
    [tag.id, clearFocus]
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

  const handleEscapeKey = useCallback(() => {
    if (focus?.mode === "edit") {
      setFocus({ ...focus, mode: "nav" });
      containerRef.current?.focus();
    } else {
      focusMainInput();
    }
  }, [focus, setFocus, focusMainInput]);

  const handleContainerKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!focus) return;

      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.preventDefault();
        selectAllTags();
        focusMainInput();
        return;
      }

      if (e.key === "Enter" && (focus.position === "remove" || focus.mode === "nav")) {
        e.preventDefault();
        if (focus.position === "remove") handleRemove(e);
        else setFocus({ ...focus, mode: "edit" });
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        handleEscapeKey();
        return;
      }

      if (focus.mode === "nav") {
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
    [focus, focusMainInput, handleEscapeKey, handleRemove, navigateWithinTag, selectAllTags, setFocus, tag.id]
  );

  const removeButtonClassName = cn(
    "h-5.5 w-6 p-0 rounded-l-none rounded-r-[0.29rem] transition-colors outline-none border-0",
    focus?.position === "remove" && "bg-primary/35"
  );

  return (
    <div
      ref={containerRef}
      tabIndex={focus?.mode === "nav" ? 0 : -1}
      className={cn(
        "inline-flex items-center rounded-md border bg-background h-6",
        "divide-x transition-all outline-none",
        "data-[selected=true]:border-primary data-[selected=true]:ring-1 data-[selected=true]:ring-primary/60"
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
        focused={focus?.position === "value" && focus.mode === "edit"}
        ref={valueInputRef}
        mode={focus?.mode ?? "nav"}
      />

      <Button
        variant="ghost"
        ref={removeRef}
        onClick={handleRemove}
        className={removeButtonClassName}
        type="button"
        aria-label={removeLabel}
      >
        <X className="w-3 h-3 text-secondary-foreground" />
      </Button>
    </div>
  );
};

FilterTag.displayName = "FilterTag";

export default memo(FilterTag);
