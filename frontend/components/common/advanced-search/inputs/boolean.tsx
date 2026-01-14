"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import FilterSelect, { type FilterSelectOption } from "@/components/ui/filter-select";

import { useAdvancedSearchContext, useAdvancedSearchNavigation, useAdvancedSearchRefsContext } from "../store";
import { type FocusableRef, type FocusMode } from "../types";

interface BooleanValueInputProps {
  tagId: string;
  focused: boolean;
  mode: FocusMode;
  ref?: Ref<FocusableRef>;
}

const booleanOptions: FilterSelectOption[] = [
  { value: "true", label: "true" },
  { value: "false", label: "false" },
];

const selectTriggerClassName = "h-6 w-fit min-w-10 max-w-52 px-2 bg-transparent text-primary text-xs";

const BooleanValueInput = ({ tagId, focused, mode, ref }: BooleanValueInputProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tags = useAdvancedSearchContext((state) => state.tags);

  const { updateTagValue, submit } = useAdvancedSearchContext((state) => ({
    updateTagValue: state.updateTagValue,
    submit: state.submit,
  }));

  const { mainInputRef } = useAdvancedSearchRefsContext();
  const { navigateWithinTag } = useAdvancedSearchNavigation();

  const tag = useMemo(() => tags.find((t) => t.id === tagId), [tags, tagId]);

  const selectRef = useRef<FocusableRef>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Need useImperativeHandle here because we use selectRef internally in useEffect
  useImperativeHandle(ref, () => ({
    focus: () => selectRef.current?.focus(),
  }));

  useEffect(() => {
    if (focused && mode === "edit") {
      selectRef.current?.focus();
      // Open dropdown automatically when entering edit mode
      setIsOpen(true);
    } else if (!focused || mode !== "edit") {
      setIsOpen(false);
    }
  }, [focused, mode]);

  const handleChange = useCallback(
    (newValue: string) => {
      updateTagValue(tagId, newValue);
      submit(router, pathname, searchParams);
      mainInputRef.current?.focus();
    },
    [updateTagValue, tagId, submit, router, pathname, searchParams, mainInputRef]
  );

  if (!tag) return null;

  return (
    <FilterSelect
      ref={selectRef}
      value={tag.value}
      options={booleanOptions}
      onValueChange={handleChange}
      open={isOpen}
      onOpenChange={setIsOpen}
      onNavigateLeft={() => navigateWithinTag(tagId, "left")}
      onNavigateRight={() => navigateWithinTag(tagId, "right")}
      placeholder="Select..."
      triggerClassName={selectTriggerClassName}
    />
  );
};

export default BooleanValueInput;
