"use client";

import { type Ref } from "react";

import TagInput from "@/components/common/advanced-search/components/tag-input";

import { type FocusableRef, type FocusMode } from "../types";
import { useValueInput } from "./use-value-input";

interface ArrayValueInputProps {
  tagId: string;
  suggestions: string[];
  focused: boolean;
  mode: FocusMode;
  ref?: Ref<FocusableRef>;
}

const ArrayValueInput = ({ tagId, suggestions, focused, mode, ref }: ArrayValueInputProps) => {
  const { tag, setValue, complete, commitOnBlur, navigateLeft, navigateRight } = useValueInput(tagId, mode);
  if (!tag) return null;

  return (
    <TagInput
      ref={ref}
      values={Array.isArray(tag.value) ? tag.value : []}
      onChange={setValue}
      onBlur={commitOnBlur}
      onComplete={complete}
      suggestions={suggestions}
      open={mode === "edit" && focused}
      onNavigateLeft={navigateLeft}
      onNavigateRight={navigateRight}
      placeholder="..."
    />
  );
};

export default ArrayValueInput;
