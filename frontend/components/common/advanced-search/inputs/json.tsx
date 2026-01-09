"use client";

import { ChangeEvent, KeyboardEvent, Ref, useCallback, useImperativeHandle, useMemo, useRef } from "react";

import { cn } from "@/lib/utils";

import { useFilterSearch } from "../context";
import { FocusableRef, FocusMode } from "../types";
import { createNavFocusState,getNextField, getPreviousField } from "../utils";

interface JsonValueInputProps {
  tagId: string;
  mode: FocusMode;
  ref?: Ref<FocusableRef>;
}

const inputClassName = cn(
  "h-6 px-2 py-0 text-xs bg-transparent text-secondary-foreground outline-none",
  "placeholder:text-muted-foreground min-w-fit max-w-60",
  "focus:bg-accent/50",
  "[field-sizing:content]"
);

const JsonValueInput = ({ tagId, mode, ref }: JsonValueInputProps) => {
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

  const keyInputRef = useRef<HTMLInputElement>(null);
  const valueInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => keyInputRef.current?.focus(),
  }));

  const [jsonKey, jsonValue] = useMemo(() => {
    if (!tag) return ["", ""];
    const idx = tag.value.indexOf("=");
    return idx === -1 ? [tag.value, ""] : [tag.value.substring(0, idx), tag.value.substring(idx + 1)];
  }, [tag]);

  const handleKeyChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      updateTagValue(tagId, `${e.target.value}=${jsonValue}`);
    },
    [tagId, updateTagValue, jsonValue]
  );

  const handleValueChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      updateTagValue(tagId, `${jsonKey}=${e.target.value}`);
    },
    [tagId, updateTagValue, jsonKey]
  );

  const handleComplete = useCallback(() => {
    submit();
    focusMainInput();
  }, [submit, focusMainInput]);

  const handleKeyKeyDown = useCallback(
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
            valueInputRef.current?.focus();
            valueInputRef.current?.setSelectionRange(0, 0);
          }
          return;
        }
      }
    },
    [mode, handleComplete, tagId, setTagFocusState, navigateToPreviousTag]
  );

  const handleValueKeyDown = useCallback(
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
            keyInputRef.current?.focus();
            keyInputRef.current?.setSelectionRange(jsonKey.length, jsonKey.length);
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
    [mode, handleComplete, jsonKey.length, tagId, setTagFocusState, navigateToNextTag]
  );

  if (!tag) return null;

  return (
    <div className="flex items-center divide-x divide-input">
      <input
        ref={keyInputRef}
        type="text"
        value={jsonKey}
        onChange={handleKeyChange}
        onKeyDown={handleKeyKeyDown}
        placeholder="key"
        className={cn(inputClassName, "min-w-10 max-w-32")}
        tabIndex={mode === "edit" ? 0 : -1}
      />
      <input
        ref={valueInputRef}
        type="text"
        value={jsonValue}
        onChange={handleValueChange}
        onKeyDown={handleValueKeyDown}
        placeholder="value"
        className={cn(inputClassName, "min-w-10 max-w-32")}
        tabIndex={mode === "edit" ? 0 : -1}
      />
    </div>
  );
};

export default JsonValueInput;
