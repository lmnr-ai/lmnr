"use client";

import { Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import FilterSelect, { FilterSelectOption } from "@/components/ui/filter-select";

import { useFilterSearch } from "../context";
import { FocusableRef, FocusMode } from "../types";
import { createNavFocusState,getNextField, getPreviousField } from "../utils";

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

const selectTriggerClassName = "h-6 w-fit min-w-10 max-w-52 px-2 bg-transparent text-secondary-foreground text-xs";

const BooleanValueInput = ({ tagId, focused, mode, ref }: BooleanValueInputProps) => {
  const {
    state,
    updateTagValue,
    submit,
    focusMainInput,
    setTagFocusState,
    navigateToPreviousTag,
    navigateToNextTag,
  } = useFilterSearch();
  const tag = useMemo(() => state.tags.find((t) => t.id === tagId), [state.tags, tagId]);

  const selectRef = useRef<FocusableRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

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

  const handleNavigateLeft = useCallback(() => {
    const prevField = getPreviousField("value");
    if (prevField) {
      setTagFocusState(tagId, createNavFocusState(prevField));
    } else {
      navigateToPreviousTag(tagId);
    }
  }, [tagId, setTagFocusState, navigateToPreviousTag]);

  const handleNavigateRight = useCallback(() => {
    const nextField = getNextField("value");
    if (nextField) {
      setTagFocusState(tagId, createNavFocusState(nextField));
    } else {
      navigateToNextTag(tagId);
    }
  }, [tagId, setTagFocusState, navigateToNextTag]);

  if (!tag) return null;

  return (
    <div ref={containerRef}>
      <FilterSelect
        ref={selectRef}
        value={tag.value}
        options={booleanOptions}
        onChange={handleChange}
        open={isOpen}
        onOpenChange={setIsOpen}
        onNavigateLeft={handleNavigateLeft}
        onNavigateRight={handleNavigateRight}
        placeholder="Select..."
        triggerClassName={selectTriggerClassName}
      />
    </div>
  );
};

export default BooleanValueInput;
