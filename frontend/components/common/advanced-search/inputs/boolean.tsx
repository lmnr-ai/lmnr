"use client";

import { Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import FilterSelect, { FilterSelectOption } from "@/components/ui/filter-select";

import { useFilterSearch } from "../context";
import { FocusableRef, FocusMode } from "../types";

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
  const { state, updateTagValue, submit, focusMainInput, navigateWithinTag } = useFilterSearch();
  const tag = useMemo(() => state.tags.find((t) => t.id === tagId), [state.tags, tagId]);

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
      submit();
      focusMainInput();
    },
    [tagId, updateTagValue, submit, focusMainInput]
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
