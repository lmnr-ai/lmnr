"use client";

import { KeyboardEvent, Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";

import { default as UIFilterSelect, FilterSelectOption } from "@/components/ui/filter-select";
import { cn } from "@/lib/utils";

import { useFilterSearch } from "../context";
import { FocusableRef, getOperationsForField } from "../types";

interface FilterSelectProps {
  tagId: string;
  selectType: "field" | "operator";
  onNavigateLeft: () => void;
  onNavigateRight: () => void;
  ref?: Ref<FocusableRef>;
}

const FilterSelect = ({ tagId, selectType, onNavigateLeft, onNavigateRight, ref }: FilterSelectProps) => {
  const {
    filters,
    state,
    updateTagField,
    updateTagOperator,
    updateTagValue,
    getTagFocusState,
    setTagFocusState,
    setActiveTagId,
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

  // Auto-focus when entering edit mode for this select
  useEffect(() => {
    if (focusState.type === selectType && "mode" in focusState && focusState.mode === "edit") {
      selectRef.current?.focus();
    }
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
        // Move to operator in edit mode but dropdown closed
        setTagFocusState(tagId, { type: "operator", mode: "edit", isOpen: false });
      } else {
        updateTagOperator(tag.id, newValue as any);
        // Move to value in edit mode
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

  // Handle keyboard navigation when select is closed and in edit mode
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isOpen) return; // Let FilterSelect handle it

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        onNavigateLeft();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        onNavigateRight();
      }
    },
    [isOpen, onNavigateLeft, onNavigateRight]
  );

  if (!tag) return null;

  const wrapperClassName = cn(
    focusState.type === selectType && "mode" in focusState && focusState.mode === "nav" && "bg-accent/50"
  );

  return (
    <div className={wrapperClassName} onMouseDown={handleClick} onClick={(e) => e.stopPropagation()}>
      <div onKeyDown={handleKeyDown}>
        <UIFilterSelect
          ref={selectRef}
          value={value}
          options={options}
          onChange={handleChange}
          open={isOpen}
          onOpenChange={handleOpenChange}
          triggerClassName="h-6 w-fit min-w-[28px] px-1.5 bg-transparent text-secondary-foreground font-medium text-xs"
        />
      </div>
    </div>
  );
};

export default FilterSelect;
