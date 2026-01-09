"use client";

import { ChangeEvent, KeyboardEvent, Ref, useCallback, useImperativeHandle, useMemo, useRef } from "react";

import { cn } from "@/lib/utils";

import { useFilterSearch } from "../context";
import { FocusableRef, FocusMode } from "../types";
import { createNavFocusState,getNextField, getPreviousField } from "../utils";

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
            const prevField = getPreviousField("value");
            if (prevField) {
              setTagFocusState(tagId, createNavFocusState(prevField));
            } else {
              navigateToPreviousTag(tagId);
            }
          }
          return;
        }

        if (e.key === "ArrowRight") {
          if (input.selectionStart === null || input.selectionStart === input.value.length) {
            e.preventDefault();
            const nextField = getNextField("value");
            if (nextField) {
              setTagFocusState(tagId, createNavFocusState(nextField));
            } else {
              navigateToNextTag(tagId);
            }
          }
          return;
        }
      }
    },
    [mode, handleComplete, tagId, setTagFocusState, navigateToPreviousTag, navigateToNextTag]
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
        placeholder="0"
        className={inputClassName}
        tabIndex={mode === "edit" ? 0 : -1}
      />
    </div>
  );
};

export default NumberValueInput;
