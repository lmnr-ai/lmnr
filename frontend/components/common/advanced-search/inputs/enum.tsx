"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type Ref, useCallback, useMemo } from "react";

import FilterSelect, { type FilterSelectOption } from "@/components/ui/filter-select";

import { useAdvancedSearchContext, useAdvancedSearchNavigation, useAdvancedSearchRefsContext } from "../store";
import { type FocusableRef } from "../types";

interface EnumOption {
  value: string;
  label: string;
}

interface EnumValueInputProps {
  tagId: string;
  options: EnumOption[];
  ref?: Ref<FocusableRef>;
}

const selectTriggerClassName = "h-6 w-fit min-w-10 max-w-52 px-2 bg-transparent text-primary text-xs";

const EnumValueInput = ({ tagId, options, ref }: EnumValueInputProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tags = useAdvancedSearchContext((state) => state.tags);
  const getTagFocusState = useAdvancedSearchContext((state) => state.getTagFocusState);

  const { updateTagValue, submit } = useAdvancedSearchContext((state) => ({
    updateTagValue: state.updateTagValue,
    submit: state.submit,
  }));

  const { mainInputRef } = useAdvancedSearchRefsContext();
  const { navigateWithinTag } = useAdvancedSearchNavigation();

  const tag = useMemo(() => tags.find((t) => t.id === tagId), [tags, tagId]);

  const focusState = getTagFocusState(tagId);

  const handleChange = useCallback(
    (newValue: string) => {
      updateTagValue(tagId, newValue);
      submit(router, pathname, searchParams);
      mainInputRef.current?.focus();
    },
    [updateTagValue, tagId, submit, router, pathname, searchParams, mainInputRef]
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
      placeholder="select ..."
      triggerClassName={selectTriggerClassName}
    />
  );
};

export default EnumValueInput;
