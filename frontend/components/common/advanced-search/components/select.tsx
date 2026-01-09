"use client";

import { Ref, useCallback, useImperativeHandle, useMemo, useRef } from "react";

import { default as UIFilterSelect, FilterSelectOption } from "@/components/ui/filter-select";
import { cn } from "@/lib/utils";

import { useFilterSearch } from "../context";
import { FocusableRef, getOperationsForField } from "../types";
import { createNavFocusState,getNextField, getPreviousField } from "../utils";

interface FilterSelectProps {
  tagId: string;
  selectType: "field" | "operator";
  ref?: Ref<FocusableRef>;
}

const FilterSelect = ({ tagId, selectType, ref }: FilterSelectProps) => {
  const {
    filters,
    state,
    updateTagField,
    updateTagOperator,
    updateTagValue,
    getTagFocusState,
    setTagFocusState,
    setActiveTagId,
    navigateToPreviousTag,
    navigateToNextTag,
  } = useFilterSearch();
  const selectRef = useRef<FocusableRef>(null);

  const tag = useMemo(() => state.tags.find((t) => t.id === tagId), [state.tags, tagId]);
  const focusState = getTagFocusState(tagId);

  useImperativeHandle(ref, () => ({
    focus: () => selectRef.current?.focus(),
  }));

  const options: FilterSelectOption[] = useMemo(() => {
    if (selectType === "field") {
      return filters.map((f) => ({ value: f.key, label: f.name }));
    } else {
      // operator
      if (!tag) return [];
      const operations = getOperationsForField(filters, tag.field);
      return operations.map((op) => ({ value: op.key, label: op.label }));
    }
  }, [selectType, filters, tag]);

  const value = useMemo(() => {
    if (!tag) return "";
    return selectType === "field" ? tag.field : tag.operator;
  }, [tag, selectType]);

  const isOpen = useMemo(() => {
    if (focusState.type !== selectType) return false;
    if (focusState.mode !== "edit") return false;
    return (focusState as any).isOpen ?? false;
  }, [focusState, selectType]);

  const handleClick = useCallback(() => {
    setActiveTagId(tagId);
    setTagFocusState(tagId, { type: selectType, mode: "edit", isOpen: false });
    selectRef.current?.focus();
  }, [tagId, selectType, setActiveTagId, setTagFocusState]);

  const handleChange = useCallback(
    (newValue: string) => {
      if (!tag) return;

      if (selectType === "field") {
        updateTagField(tag.id, newValue);
        updateTagValue(tag.id, "");
        setTagFocusState(tagId, { type: "operator", mode: "edit", isOpen: false });
      } else {
        updateTagOperator(tag.id, newValue as any);
        setTagFocusState(tagId, { type: "value", mode: "edit", showSuggestions: false, isSelectOpen: false });
      }
    },
    [tag, selectType, updateTagField, updateTagOperator, updateTagValue, setTagFocusState, tagId]
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (focusState.type === selectType && focusState.mode === "edit") {
        setTagFocusState(tagId, { ...focusState, isOpen: open } as any);
      }
    },
    [focusState, selectType, setTagFocusState, tagId]
  );

  const handleNavigateLeft = useCallback(() => {
    if (focusState.type === "idle") return;

    const prevField = getPreviousField(selectType);

    if (prevField) {
      setTagFocusState(tagId, createNavFocusState(prevField));
    } else {
      // At leftmost field, navigate to previous tag
      navigateToPreviousTag(tagId);
    }
  }, [focusState.type, selectType, tagId, setTagFocusState, navigateToPreviousTag]);

  const handleNavigateRight = useCallback(() => {
    if (focusState.type === "idle") return;

    const nextField = getNextField(selectType);

    if (nextField) {
      setTagFocusState(tagId, createNavFocusState(nextField));
    } else {
      navigateToNextTag(tagId);
    }
  }, [focusState.type, selectType, tagId, setTagFocusState, navigateToNextTag]);

  if (!tag) return null;

  const wrapperClassName = cn(
    focusState.type === selectType && "mode" in focusState && focusState.mode === "nav" && "bg-accent/50"
  );

  return (
    <div className={wrapperClassName} onMouseDown={handleClick} onClick={(e) => e.stopPropagation()}>
      <div>
        <UIFilterSelect
          ref={selectRef}
          value={value}
          options={options}
          onChange={handleChange}
          open={isOpen}
          onOpenChange={handleOpenChange}
          onNavigateLeft={handleNavigateLeft}
          onNavigateRight={handleNavigateRight}
          triggerClassName="h-6 w-fit min-w-[28px] px-1.5 bg-transparent text-secondary-foreground font-medium text-xs"
        />
      </div>
    </div>
  );
};

export default FilterSelect;
