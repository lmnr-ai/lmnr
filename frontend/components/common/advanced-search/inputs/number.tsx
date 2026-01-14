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

import { cn } from "@/lib/utils";

import { useAdvancedSearchContext, useAdvancedSearchNavigation, useAdvancedSearchRefsContext } from "../store";
import { type FocusableRef, type FocusMode } from "../types";

interface NumberValueInputProps {
  tagId: string;
  mode: FocusMode;
  ref?: Ref<FocusableRef>;
}

const inputClassName = cn(
  "h-6 px-2 py-0 text-xs bg-transparent text-primary outline-none",
  "placeholder:text-primary min-w-fit max-w-60",
  "[field-sizing:content]",
  "hide-arrow"
);

const NumberValueInput = ({ tagId, mode, ref }: NumberValueInputProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tags = useAdvancedSearchContext((state) => state.tags);

  const { submit, updateTagValue } = useAdvancedSearchContext((state) => ({
    updateTagValue: state.updateTagValue,
    submit: state.submit,
  }));

  const { mainInputRef } = useAdvancedSearchRefsContext();
  const { navigateWithinTag } = useAdvancedSearchNavigation();

  const tag = useMemo(() => tags.find((t) => t.id === tagId), [tags, tagId]);

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
