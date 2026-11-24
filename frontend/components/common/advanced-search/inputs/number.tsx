"use client";

import { type KeyboardEvent, type Ref, useCallback, useImperativeHandle, useRef } from "react";

import { useSizeInput } from "@/hooks/use-size-input.tsx";
import { cn } from "@/lib/utils";

import { type FocusableRef, type FocusMode } from "../types";
import { isCaretAtEnd, isCaretAtStart } from "../utils";
import { useValueInput } from "./use-value-input";

interface NumberValueInputProps {
  tagId: string;
  mode: FocusMode;
  ref?: Ref<FocusableRef>;
}

const inputClassName = cn(
  "h-5.5 px-2 py-0 text-xs bg-transparent text-primary-text outline-none",
  "placeholder:text-primary-text hide-arrow max-w-24"
);

const NumberValueInput = ({ tagId, mode, ref }: NumberValueInputProps) => {
  const { tag, setValue, complete, commitOnBlur, navigateLeft, navigateRight } = useValueInput(tagId, mode);

  const inputRef = useRef<HTMLInputElement>(null);
  const autosizeRef = useSizeInput(tag?.value);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));

  const combinedRef = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      autosizeRef(node);
    },
    [autosizeRef]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (mode !== "edit") return;
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.stopPropagation();
      } else if (e.key === "Enter") {
        e.preventDefault();
        complete();
      } else if (e.key === "ArrowLeft" && isCaretAtStart(e.currentTarget)) {
        navigateLeft();
      } else if (e.key === "ArrowRight" && isCaretAtEnd(e.currentTarget)) {
        navigateRight();
      }
    },
    [mode, complete, navigateLeft, navigateRight]
  );

  if (!tag) return null;

  return (
    <input
      ref={combinedRef}
      type="number"
      value={tag.value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={commitOnBlur}
      placeholder="..."
      className={inputClassName}
      tabIndex={mode === "edit" ? 0 : -1}
    />
  );
};

export default NumberValueInput;
