"use client";

import { Ref, useCallback, useMemo } from "react";

import FilterSelect, { FilterSelectOption } from "@/components/ui/filter-select";

import { useFilterSearch } from "../context";
import { FocusableRef } from "../types";

interface EnumOption {
  value: string;
  label: string;
}

interface EnumValueInputProps {
  tagId: string;
  options: EnumOption[];
  ref?: Ref<FocusableRef>;
}

const selectTriggerClassName = "h-6 w-fit min-w-10 max-w-52 px-2 bg-transparent text-secondary-foreground text-xs";

const EnumValueInput = ({ tagId, options, ref }: EnumValueInputProps) => {
  const { state, getTagFocusState, updateTagValue, submit, focusMainInput, navigateWithinTag } = useFilterSearch();
  const tag = useMemo(() => state.tags.find((t) => t.id === tagId), [state.tags, tagId]);

  const focusState = getTagFocusState(tagId);

  const handleChange = useCallback(
    (newValue: string) => {
      updateTagValue(tagId, newValue);
      submit();
      focusMainInput();
    },
    [tagId, updateTagValue, submit, focusMainInput]
  );

  const selectOptions: FilterSelectOption[] = options.map((opt) => ({
    value: opt.value,
    label: opt.label,
  }));

  if (!tag) return null;

  return (
    <FilterSelect
      ref={ref}
      value={tag.value}
      options={selectOptions}
      onValueChange={handleChange}
      open={focusState.type === "value" && focusState.mode === "edit"}
      onNavigateLeft={() => navigateWithinTag(tagId, "left")}
      onNavigateRight={() => navigateWithinTag(tagId, "right")}
      onOpenChange={() => {}}
      placeholder="Select..."
      triggerClassName={selectTriggerClassName}
    />
  );
};

export default EnumValueInput;
