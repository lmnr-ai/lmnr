"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

interface JsonValueInputProps {
  tagId: string;
  mode: FocusMode;
  ref?: Ref<FocusableRef>;
}

const inputClassName = cn(
  "h-6 px-2 py-0 text-xs bg-transparent text-primary outline-none",
  "placeholder:text-primary font-medium"
);

const JsonValueInput = ({ tagId, mode, ref }: JsonValueInputProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tags = useAdvancedSearchContext((state) => state.tags);

  const { updateTagValue, submit } = useAdvancedSearchContext((state) => ({
    updateTagValue: state.updateTagValue,
    submit: state.submit,
  }));

  const { mainInputRef } = useAdvancedSearchRefsContext();

  const { navigateWithinTag } = useAdvancedSearchNavigation();

  const tag = useMemo(() => tags.find((t) => t.id === tagId), [tags, tagId]);

  const keyInputRef = useRef<HTMLInputElement>(null);
  const valueInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => keyInputRef.current?.focus(),
  }));

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
    submit(router, pathname, searchParams);
    mainInputRef.current?.focus();
  }, [submit, router, pathname, searchParams, mainInputRef]);

  const handleBlur = useCallback(() => {
    if (mode === "edit") {
      queueMicrotask(() => {
        submit(router, pathname, searchParams);
      });
    }
  }, [submit, mode, router, pathname, searchParams]);

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
            e.stopPropagation();
            navigateWithinTag(tagId, "left");
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
    [mode, handleComplete, tagId, navigateWithinTag]
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
            keyInputRef.current?.focus();
            keyInputRef.current?.setSelectionRange(jsonKey.length, jsonKey.length);
          }
          return;
        }

        if (e.key === "ArrowRight") {
          if (input.selectionStart === null || input.selectionStart === input.value.length) {
            navigateWithinTag(tagId, "right");
          }
          return;
        }
      }
    },
    [mode, handleComplete, jsonKey.length, tagId, navigateWithinTag]
  );

  if (!tag) return null;

  return (
    <div className="flex items-center divide-x divide-primary/20">
      <input
        ref={combinedKeyRef}
        type="text"
        value={jsonKey}
        onChange={handleKeyChange}
        onKeyDown={handleKeyKeyDown}
        placeholder="key"
        style={{ minWidth: "40px", maxWidth: "128px" }}
        className={inputClassName}
        tabIndex={mode === "edit" ? 0 : -1}
      />
      <input
        ref={combinedValueRef}
        type="text"
        value={jsonValue}
        onChange={handleValueChange}
        onKeyDown={handleValueKeyDown}
        onBlur={handleBlur}
        placeholder="value"
        style={{ minWidth: "40px", maxWidth: "128px" }}
        className={inputClassName}
        tabIndex={mode === "edit" ? 0 : -1}
      />
    </div>
  );
};

export default JsonValueInput;
