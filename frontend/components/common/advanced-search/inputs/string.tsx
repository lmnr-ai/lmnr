"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type Ref, useCallback, useImperativeHandle, useMemo, useRef } from "react";

import NativeCombobox from "@/components/ui/native-combobox";
import { cn } from "@/lib/utils";

import { useAdvancedSearchContext, useAdvancedSearchNavigation, useAdvancedSearchRefsContext } from "../store";
import { type FocusableRef, type FocusMode } from "../types";

interface StringValueInputProps {
  tagId: string;
  suggestions: string[];
  focused: boolean;
  mode: FocusMode;
  ref?: Ref<FocusableRef>;
}

const inputClassName = cn(
  "h-6 px-2 py-0 text-xs bg-transparent outline-none text-primary",
  "placeholder:text-primary/50 min-w-fit max-w-60",
  "[field-sizing:content]"
);

const StringValueInput = ({ tagId, suggestions, focused, mode, ref }: StringValueInputProps) => {
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

  const comboboxRef = useRef<FocusableRef>(null);

  useImperativeHandle(ref, () => ({
    focus: () => comboboxRef.current?.focus(),
  }));

  const handleChange = useCallback(
    (value: string) => {
      updateTagValue(tagId, value);
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

  if (!tag) return null;

  return (
    <NativeCombobox
      ref={comboboxRef}
      value={tag.value}
      onChange={handleChange}
      onBlur={handleBlur}
      onComplete={handleComplete}
      suggestions={suggestions}
      open={mode === "edit" && focused}
      onNavigateLeft={() => navigateWithinTag(tagId, "left")}
      onNavigateRight={() => navigateWithinTag(tagId, "right")}
      placeholder="..."
      inputClassName={inputClassName}
    />
  );
};

export default StringValueInput;
