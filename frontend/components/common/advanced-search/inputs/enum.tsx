"use client";

import { type Ref, useCallback } from "react";

import FilterSelect, {
  type FilterSelectOption,
} from "@/components/common/advanced-search/components/filter-select.tsx";

import { useTagFocus } from "../store";
import { type FocusableRef } from "../types";
import { useValueInput } from "./use-value-input";

interface EnumValueInputProps {
  tagId: string;
  options: FilterSelectOption[];
  ref?: Ref<FocusableRef>;
}

const selectTriggerClassName = "h-6 w-fit min-w-10 max-w-40 px-2 bg-transparent text-xs text-primary-text";

const EnumValueInput = ({ tagId, options, ref }: EnumValueInputProps) => {
  const { tag, setValue, complete, navigateLeft, navigateRight } = useValueInput(tagId);
  const focus = useTagFocus(tagId);

  const handleChange = useCallback(
    (value: string) => {
      setValue(value);
      complete();
    },
    [setValue, complete]
  );

  if (!tag) return null;

  return (
    <FilterSelect
      ref={ref}
      value={Array.isArray(tag.value) ? (tag.value[0] ?? "") : tag.value}
      options={options}
      onValueChange={handleChange}
      open={focus?.position === "value" && focus.mode === "edit"}
      onNavigateLeft={navigateLeft}
      onNavigateRight={navigateRight}
      onOpenChange={() => {}}
      placeholder="select ..."
      triggerClassName={selectTriggerClassName}
    />
  );
};

export default EnumValueInput;
