"use client";

import { KeyboardEvent, Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import FilterSelect, { FilterSelectOption } from "@/components/ui/filter-select";
import { cn } from "@/lib/utils";

import { useFilterSearch } from "../context";
import { FocusableRef, FocusMode } from "../types";

interface EnumOption {
  value: string;
  label: string;
}

interface EnumValueInputProps {
  tagId: string;
  options: EnumOption[];
  focused: boolean;
  onExitEditLeft?: () => void;
  onExitEditRight?: () => void;
  mode: FocusMode;
  ref?: Ref<FocusableRef>;
}

const EnumValueInput = ({
  tagId,
  options,
  focused,
  onExitEditLeft,
  onExitEditRight,
  mode,
  ref,
}: EnumValueInputProps) => {
  const { state, updateTagValue, submit, focusMainInput } = useFilterSearch();
  const tag = useMemo(() => state.tags.find((t) => t.id === tagId), [state.tags, tagId]);

  const selectRef = useRef<FocusableRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    focus: () => selectRef.current?.focus(),
  }));

  // Auto-focus and open when entering edit mode
  useEffect(() => {
    if (focused && mode === "edit") {
      selectRef.current?.focus();
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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isOpen) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        onExitEditLeft?.();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        onExitEditRight?.();
      }
    },
    [isOpen, onExitEditLeft, onExitEditRight]
  );

  const selectTriggerClassName = cn(
    "h-6 w-fit min-w-10 max-w-52 px-2 bg-transparent text-secondary-foreground text-xs"
  );

  const selectOptions: FilterSelectOption[] = options.map((opt) => ({
    value: opt.value,
    label: opt.label,
  }));

  if (!tag) return null;

  return (
    <div ref={containerRef} onKeyDown={handleKeyDown}>
      <FilterSelect
        ref={selectRef}
        value={tag.value}
        options={selectOptions}
        onChange={handleChange}
        open={isOpen}
        onOpenChange={setIsOpen}
        placeholder="Select..."
        triggerClassName={selectTriggerClassName}
      />
    </div>
  );
};

export default EnumValueInput;
