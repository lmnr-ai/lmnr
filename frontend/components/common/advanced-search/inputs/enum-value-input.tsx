"use client";

import { Ref, useCallback, useImperativeHandle, useMemo, useRef } from "react";

import FilterSelect, { FilterSelectOption } from "@/components/ui/filter-select";

import { useFilterSearch } from "../context";
import { FocusableRef, FocusMode } from "../types";

interface EnumOption {
  value: string;
  label: string;
}

interface EnumValueInputProps {
  tagId: string;
  options: EnumOption[];
  onExitEditLeft?: () => void;
  onExitEditRight?: () => void;
  mode: FocusMode;
  ref?: Ref<FocusableRef>;
}

const selectTriggerClassName = "h-6 w-fit min-w-10 max-w-52 px-2 bg-transparent text-secondary-foreground text-xs";

const EnumValueInput = ({ tagId, options, onExitEditLeft, onExitEditRight, mode, ref }: EnumValueInputProps) => {
  const { state, updateTagValue, submit, focusMainInput } = useFilterSearch();
  const tag = useMemo(() => state.tags.find((t) => t.id === tagId), [state.tags, tagId]);

  const selectRef = useRef<FocusableRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isOpen = mode === "edit";

  useImperativeHandle(ref, () => ({
    focus: () => selectRef.current?.focus(),
  }));

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
    <div ref={containerRef}>
      <FilterSelect
        ref={selectRef}
        value={tag.value}
        options={selectOptions}
        onChange={handleChange}
        open={isOpen}
        onNavigateLeft={onExitEditLeft}
        onNavigateRight={onExitEditRight}
        onOpenChange={() => {}}
        placeholder="Select..."
        triggerClassName={selectTriggerClassName}
      />
    </div>
  );
};

export default EnumValueInput;
