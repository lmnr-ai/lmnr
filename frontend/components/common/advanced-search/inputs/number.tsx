"use client";

import {
  type ChangeEvent,
  type KeyboardEvent,
  type Ref,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

import { useSizeInput } from "@/hooks/use-size-input.tsx";
import { cn } from "@/lib/utils";

import { useAdvancedSearchContext, useAdvancedSearchNavigation, useAdvancedSearchRefsContext } from "../store";
import { type FocusableRef, type FocusMode } from "../types";

interface NumberValueInputProps {
  tagId: string;
  mode: FocusMode;
  ref?: Ref<FocusableRef>;
}

const inputClassName = cn(
  "h-5.5 px-2 py-0 text-xs bg-transparent text-primary outline-none",
  "placeholder:text-primary hide-arrow"
);

const NumberValueInput = ({ tagId, mode, ref }: NumberValueInputProps) => {
  const tags = useAdvancedSearchContext((state) => state.tags);

  const { submit, updateTagValue } = useAdvancedSearchContext((state) => ({
    updateTagValue: state.updateTagValue,
    submit: state.submit,
  }));

  const { mainInputRef } = useAdvancedSearchRefsContext();
  const { navigateWithinTag } = useAdvancedSearchNavigation();

  const tag = useMemo(() => tags.find((t) => t.id === tagId), [tags, tagId]);

  const inputRef = useRef<HTMLInputElement>(null);
  const autosizeRef = useSizeInput(tag?.value);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  const combinedRef = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      autosizeRef(node);
    },
    [autosizeRef]
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      updateTagValue(tagId, e.target.value);
    },
    [tagId, updateTagValue]
  );

  const handleComplete = useCallback(() => {
    submit();
    mainInputRef.current?.focus();
  }, [submit, mainInputRef]);

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
        if ((e.metaKey || e.ctrlKey) && e.key === "a") {
          e.stopPropagation();
          return;
        }

        if (e.key === "Enter") {
          e.preventDefault();
          handleComplete();
          return;
        }

        const input = e.target as HTMLInputElement;

        if (e.key === "ArrowLeft") {
          if (input.selectionStart === null || input.selectionStart === 0) {
            navigateWithinTag(tagId, "left");
            return;
          }
        }

        if (e.key === "ArrowRight") {
          if (input.selectionStart === null || input.selectionStart === input.value.length) {
            navigateWithinTag(tagId, "right");
            return;
          }
        }
      }
    },
    [mode, handleComplete, tagId, navigateWithinTag]
  );

  if (!tag) return null;

  return (
    <input
      ref={combinedRef}
      type="number"
      value={tag.value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      placeholder="..."
      className={inputClassName}
      tabIndex={mode === "edit" ? 0 : -1}
    />
  );
};

export default NumberValueInput;
