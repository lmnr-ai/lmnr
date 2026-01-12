"use client";

import { Ref, useCallback, useMemo } from "react";

import { default as UIFilterSelect, FilterSelectOption } from "@/components/ui/filter-select";
import { Operator } from "@/lib/actions/common/operators.ts";
import { cn } from "@/lib/utils";

import { useFilterSearch } from "../context";
import { FocusableRef, getOperationsForField } from "../types";

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
    navigateWithinTag,
  } = useFilterSearch();

  const tag = useMemo(() => state.tags.find((t) => t.id === tagId), [state.tags, tagId]);
  const focusState = getTagFocusState(tagId);

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

  const isOpen = useMemo(() => focusState.type === selectType && focusState.mode === "edit", [focusState, selectType]);

  const handleClick = useCallback(() => {
    setTagFocusState(tagId, { type: selectType, mode: "edit" });
    if (ref && typeof ref !== "function" && ref.current) {
      ref.current.focus();
    }
  }, [tagId, setTagFocusState, selectType, ref]);

  const handleChange = useCallback(
    (newValue: string) => {
      if (!tag) return;

      if (selectType === "field") {
        updateTagField(tag.id, newValue);
        updateTagValue(tag.id, "");
        setTagFocusState(tagId, { type: "operator", mode: "edit" });
      } else {
        updateTagOperator(tag.id, newValue as Operator);
        setTagFocusState(tagId, { type: "value", mode: "edit" });
      }
    },
    [tag, selectType, updateTagField, updateTagOperator, updateTagValue, setTagFocusState, tagId]
  );

  if (!tag) return null;

  const wrapperClassName = cn(focusState.type === selectType && "bg-accent", {
    "rounded-l-md": selectType === "field",
  });

  return (
    <UIFilterSelect
      className={wrapperClassName}
      onMouseDown={handleClick}
      onClick={(e) => e.stopPropagation()}
      ref={ref}
      value={value}
      options={options}
      onValueChange={handleChange}
      open={isOpen}
      onOpenChange={() => {}}
      onNavigateLeft={() => navigateWithinTag(tagId, "left")}
      onNavigateRight={() => navigateWithinTag(tagId, "right")}
      triggerClassName={cn("h-6 w-fit min-w-[28px] px-1.5 text-secondary-foreground font-medium text-xs", {
        "rounded-l-md": selectType === "field",
      })}
    />
  );
};

export default FilterSelect;
