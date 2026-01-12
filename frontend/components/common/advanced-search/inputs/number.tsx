"use client";

import { ChangeEvent, KeyboardEvent, Ref, useCallback, useImperativeHandle, useMemo, useRef } from "react";

import { cn } from "@/lib/utils";

import { useFilterSearch } from "../context";
import { FocusableRef, FocusMode } from "../types";

interface NumberValueInputProps {
  tagId: string;
  mode: FocusMode;
  ref?: Ref<FocusableRef>;
}

const inputClassName = cn(
  "h-6 px-2 py-0 text-xs bg-transparent text-secondary-foreground outline-none",
  "placeholder:text-muted-foreground min-w-fit max-w-60",
  "focus:bg-accent/50",
  "[field-sizing:content]",
  "hide-arrow"
);

const NumberValueInput = ({ tagId, mode, ref }: NumberValueInputProps) => {
  const { state, updateTagValue, submit, focusMainInput, navigateWithinTag } = useFilterSearch();
  const tag = useMemo(() => state.tags.find((t) => t.id === tagId), [state.tags, tagId]);

  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      updateTagValue(tagId, e.target.value);
    },
    [tagId, updateTagValue]
  );

  const handleComplete = useCallback(() => {
    submit();
    focusMainInput();
  }, [submit, focusMainInput]);

  const handleBlur = useCallback(() => {
    if (mode === "edit") {
      queueMicrotask(() => {
        submit();
      });
    }
  }, [submit, mode]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (mode === "edit") {
        if (e.key === "Enter") {
          e.preventDefault();
          handleComplete();
          return;
        }

        const input = e.target as HTMLInputElement;

        if (e.key === "ArrowLeft") {
          if (input.selectionStart === null || input.selectionStart === 0) {
            e.preventDefault();
            e.stopPropagation();
            navigateWithinTag(tagId, "left");
          }
          return;
        }

        if (e.key === "ArrowRight") {
          if (input.selectionStart === null || input.selectionStart === input.value.length) {
            e.preventDefault();
            e.stopPropagation();
            navigateWithinTag(tagId, "right");
          }
          return;
        }
      }
    },
    [mode, handleComplete, tagId, navigateWithinTag]
  );

  if (!tag) return null;

  return (
    <div className="relative flex items-center">
      <input
        ref={inputRef}
        type="number"
        value={tag.value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder="..."
        className={inputClassName}
        tabIndex={mode === "edit" ? 0 : -1}
      />
    </div>
  );
};

export default NumberValueInput;
