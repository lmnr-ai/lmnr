"use client";

import {
  type FocusEvent,
  type KeyboardEvent,
  type Ref,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

import { useSizeInput } from "@/hooks/use-size-input.tsx";
import { cn } from "@/lib/utils";

import { type FocusableRef, type FocusMode } from "../types";
import { isCaretAtEnd, isCaretAtStart } from "../utils";
import { useValueInput } from "./use-value-input";

interface JsonValueInputProps {
  tagId: string;
  mode: FocusMode;
  ref?: Ref<FocusableRef>;
}

const inputClassName = cn(
  "h-6 px-2 py-0 text-xs bg-transparent text-primary-text outline-none",
  "placeholder:text-primary-text font-medium text-ellipsis"
);

const JsonValueInput = ({ tagId, mode, ref }: JsonValueInputProps) => {
  const { tag, setValue, complete, commitOnBlur, navigateLeft, navigateRight } = useValueInput(tagId, mode);

  const keyInputRef = useRef<HTMLInputElement>(null);
  const valueInputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => keyInputRef.current?.focus() }));

  const [jsonKey, jsonValue] = useMemo(() => {
    if (!tag) return ["", ""];
    const value = Array.isArray(tag.value) ? tag.value.join(",") : tag.value;
    const idx = value.indexOf("=");
    return idx === -1 ? [value, ""] : [value.substring(0, idx), value.substring(idx + 1)];
  }, [tag]);

  const keyAutosizeRef = useSizeInput(jsonKey);
  const valueAutosizeRef = useSizeInput(jsonValue);

  const combinedKeyRef = useCallback(
    (node: HTMLInputElement | null) => {
      keyInputRef.current = node;
      keyAutosizeRef(node);
    },
    [keyAutosizeRef]
  );

  const combinedValueRef = useCallback(
    (node: HTMLInputElement | null) => {
      valueInputRef.current = node;
      valueAutosizeRef(node);
    },
    [valueAutosizeRef]
  );

  // Commit when focus leaves the key/value pair, not when moving between them.
  const handleBlur = useCallback(
    (e: FocusEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget)) commitOnBlur();
    },
    [commitOnBlur]
  );

  const handleKeyKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (mode !== "edit") return;
      if (e.key === "Enter") {
        e.preventDefault();
        complete();
      } else if (e.key === "ArrowLeft" && isCaretAtStart(e.currentTarget)) {
        e.preventDefault();
        e.stopPropagation();
        navigateLeft();
      } else if (e.key === "ArrowRight" && isCaretAtEnd(e.currentTarget)) {
        e.preventDefault();
        valueInputRef.current?.focus();
        valueInputRef.current?.setSelectionRange(0, 0);
      }
    },
    [mode, complete, navigateLeft]
  );

  const handleValueKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (mode !== "edit") return;
      if (e.key === "Enter") {
        e.preventDefault();
        complete();
      } else if (e.key === "ArrowLeft" && isCaretAtStart(e.currentTarget)) {
        keyInputRef.current?.focus();
        keyInputRef.current?.setSelectionRange(jsonKey.length, jsonKey.length);
      } else if (e.key === "ArrowRight" && isCaretAtEnd(e.currentTarget)) {
        navigateRight();
      }
    },
    [mode, complete, jsonKey.length, navigateRight]
  );

  if (!tag) return null;

  return (
    <div className="flex items-center divide-x divide-primary/20" onBlur={handleBlur}>
      <input
        ref={combinedKeyRef}
        type="text"
        value={jsonKey}
        onChange={(e) => setValue(`${e.target.value}=${jsonValue}`)}
        onKeyDown={handleKeyKeyDown}
        placeholder="key"
        title={jsonKey}
        style={{ minWidth: "40px", maxWidth: "128px" }}
        className={inputClassName}
        tabIndex={mode === "edit" ? 0 : -1}
      />
      <input
        ref={combinedValueRef}
        type="text"
        value={jsonValue}
        onChange={(e) => setValue(`${jsonKey}=${e.target.value}`)}
        onKeyDown={handleValueKeyDown}
        placeholder="value"
        title={jsonValue}
        style={{ minWidth: "40px", maxWidth: "128px" }}
        className={inputClassName}
        tabIndex={mode === "edit" ? 0 : -1}
      />
    </div>
  );
};

export default JsonValueInput;
