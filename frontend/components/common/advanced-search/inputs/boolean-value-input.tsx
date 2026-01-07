"use client";

import { KeyboardEvent, Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import FilterSelect, { FilterSelectOption } from "@/components/ui/filter-select";
import { cn } from "@/lib/utils";

import { useFilterSearch } from "../context";
import { FocusableRef, FocusMode } from "../types";

interface BooleanValueInputProps {
  tagId: string;
  focused: boolean;
  onExitEditLeft?: () => void;
  onExitEditRight?: () => void;
  mode: FocusMode;
  ref?: Ref<FocusableRef>;
}

const booleanOptions: FilterSelectOption[] = [
  { value: "true", label: "true" },
  { value: "false", label: "false" },
];

const BooleanValueInput = ({ tagId, focused, onExitEditLeft, onExitEditRight, mode, ref }: BooleanValueInputProps) => {
  const { state, updateTagValue, submit, focusMainInput } = useFilterSearch();
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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Only handle arrow navigation when dropdown is closed
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
      // Let all other keys (Enter, Space, ArrowDown, etc.) pass through to FilterSelect
    },
    [isOpen, onExitEditLeft, onExitEditRight]
  );

  const selectTriggerClassName = cn(
    "h-6 w-fit min-w-10 max-w-52 px-2 bg-transparent text-secondary-foreground text-xs"
  );

  if (!tag) return null;

  return (
    <div ref={containerRef} onKeyDown={handleKeyDown}>
      <FilterSelect
        ref={selectRef}
        value={tag.value}
        options={booleanOptions}
        onChange={handleChange}
        open={isOpen}
        onOpenChange={setIsOpen}
        placeholder="Select..."
        triggerClassName={selectTriggerClassName}
      />
    </div>
  );
};

export default BooleanValueInput;
