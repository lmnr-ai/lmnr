"use client";

import { type Ref, useCallback, useMemo } from "react";

import {
  default as UIFilterSelect,
  type FilterSelectOption,
} from "@/components/common/advanced-search/components/filter-select.tsx";
import { type Operator } from "@/lib/actions/common/operators.ts";
import { cn } from "@/lib/utils";

import { useAdvancedSearchContext, useAdvancedSearchNavigation } from "../store";
import { type FocusableRef, getColumnFilter, getOperationsForField } from "../types";

interface FilterSelectProps {
  tagId: string;
  selectType: "field" | "operator";
  ref?: Ref<FocusableRef>;
}

const FilterSelect = ({ tagId, selectType, ref }: FilterSelectProps) => {
  const filters = useAdvancedSearchContext((state) => state.filters);
  const tags = useAdvancedSearchContext((state) => state.tags);

  const { updateTagField, updateTagOperator, updateTagValue, getTagFocusState, setTagFocusState } =
    useAdvancedSearchContext((state) => ({
      updateTagField: state.updateTagField,
      updateTagOperator: state.updateTagOperator,
      updateTagValue: state.updateTagValue,
      getTagFocusState: state.getTagFocusState,
      setTagFocusState: state.setTagFocusState,
    }));

  const { navigateWithinTag } = useAdvancedSearchNavigation();

  const tag = useMemo(() => tags.find((t) => t.id === tagId), [tags, tagId]);
  const focusState = getTagFocusState(tagId);

  const options: FilterSelectOption[] = useMemo(() => {
    if (selectType === "field") {
      const fieldOptions = filters.map((f) => ({ value: f.key, label: f.name }));
      // A filter from a shared URL may target a column not in this user's list
      // (e.g. someone else's custom column). Surface it so the field is labelled
      // rather than showing the empty-select placeholder.
      if (tag && !fieldOptions.some((o) => o.value === tag.field)) {
        fieldOptions.push({ value: tag.field, label: tag.field });
      }
      return fieldOptions;
    } else {
      // operator
      if (!tag) return [];
      const operations = getOperationsForField(filters, tag.field, tag.dataType);
      return operations.map((op) => ({ value: op.key, label: op.label }));
    }
  }, [selectType, filters, tag]);

  const value = useMemo(() => {
    if (!tag) return "";
    return selectType === "field" ? tag.field : tag.operator;
  }, [tag, selectType]);

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
        const operations = getOperationsForField(filters, newValue);
        // The old operator may not exist on the new column (`>` → span tags).
        if (!operations.some((op) => op.key === tag.operator)) {
          updateTagOperator(tag.id, operations[0].key);
        }
        // Array columns take a list of values, and a single-operator column has
        // a static operator label with nothing to focus — skip straight to it.
        updateTagValue(tag.id, getColumnFilter(filters, newValue)?.dataType === "array" ? [] : "");
        setTagFocusState(tagId, { type: operations.length <= 1 ? "value" : "operator", mode: "edit" });
      } else {
        updateTagOperator(tag.id, newValue as Operator);
        setTagFocusState(tagId, { type: "value", mode: "edit" });
      }
    },
    [tag, selectType, filters, updateTagField, updateTagOperator, updateTagValue, setTagFocusState, tagId]
  );

  if (!tag) return null;

  // A lone option renders as static text, so it gets neither the focus
  // highlight nor a click handler.
  const isStatic = options.length <= 1;

  const wrapperClassName = cn(focusState.type === selectType && !isStatic && "bg-primary/35", {
    "rounded-l-[0.29rem]": selectType === "field",
  });

  return (
    <UIFilterSelect
      className={wrapperClassName}
      onMouseDown={isStatic ? undefined : handleClick}
      onClick={(e) => e.stopPropagation()}
      ref={ref}
      value={value}
      options={options}
      onValueChange={handleChange}
      open={focusState.type === selectType && focusState.mode === "edit"}
      onOpenChange={() => {}}
      onNavigateLeft={() => navigateWithinTag(tagId, "left")}
      onNavigateRight={() => navigateWithinTag(tagId, "right")}
      triggerClassName={cn("h-5.5 w-fit min-w-[28px] px-2 font-medium text-xs text-secondary-foreground", {
        "rounded-l-md": selectType === "field",
      })}
    />
  );
};

export default FilterSelect;
