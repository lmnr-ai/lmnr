"use client";

import { type Ref } from "react";

import NativeCombobox from "@/components/common/advanced-search/components/native-combobox.tsx";
import { cn } from "@/lib/utils";

import { type FocusableRef, type FocusMode } from "../types";
import { useValueInput } from "./use-value-input";

interface StringValueInputProps {
  tagId: string;
  suggestions: string[];
  focused: boolean;
  mode: FocusMode;
  ref?: Ref<FocusableRef>;
}

const inputClassName = cn(
  "h-6 px-2 py-0 text-xs bg-transparent outline-none text-primary-text",
  "placeholder:text-primary-text/50 max-w-40 text-ellipsis"
);

const StringValueInput = ({ tagId, suggestions, focused, mode, ref }: StringValueInputProps) => {
  const { tag, setValue, complete, commitOnBlur, navigateLeft, navigateRight } = useValueInput(tagId, mode);
  if (!tag) return null;
  const value = Array.isArray(tag.value) ? tag.value.join(", ") : tag.value;

  return (
    <NativeCombobox
      ref={ref}
      value={value}
      onChange={setValue}
      onBlur={commitOnBlur}
      onComplete={complete}
      suggestions={suggestions}
      open={mode === "edit" && focused}
      onNavigateLeft={navigateLeft}
      onNavigateRight={navigateRight}
      placeholder="..."
      title={value}
      inputClassName={inputClassName}
    />
  );
};

export default StringValueInput;
