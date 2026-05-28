"use client";

import { type Ref, useCallback, useImperativeHandle, useMemo, useRef } from "react";

import TagInput from "@/components/common/advanced-search/components/tag-input";

import { useAdvancedSearchContext, useAdvancedSearchNavigation, useAdvancedSearchRefsContext } from "../store";
import { type FocusableRef, type FocusMode } from "../types";

interface ArrayValueInputProps {
  tagId: string;
  suggestions: string[];
  focused: boolean;
  mode: FocusMode;
  ref?: Ref<FocusableRef>;
}

const ArrayValueInput = ({ tagId, suggestions, focused, mode, ref }: ArrayValueInputProps) => {
  const tags = useAdvancedSearchContext((state) => state.tags);
  const { updateTagValue, submit } = useAdvancedSearchContext((state) => ({
    updateTagValue: state.updateTagValue,
    submit: state.submit,
  }));

  const { mainInputRef } = useAdvancedSearchRefsContext();
  const { navigateWithinTag } = useAdvancedSearchNavigation();

  const tag = useMemo(() => tags.find((t) => t.id === tagId), [tags, tagId]);
  const tagInputRef = useRef<FocusableRef>(null);

  useImperativeHandle(ref, () => ({
    focus: () => tagInputRef.current?.focus(),
  }));

  const handleChange = useCallback(
    (newValues: string[]) => {
      updateTagValue(tagId, newValues);
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

  if (!tag) return null;

  return (
    <TagInput
      ref={tagInputRef}
      values={Array.isArray(tag?.value) ? tag.value : []}
      onChange={handleChange}
      onBlur={handleBlur}
      onComplete={handleComplete}
      suggestions={suggestions}
      open={mode === "edit" && focused}
      onNavigateLeft={() => navigateWithinTag(tagId, "left")}
      onNavigateRight={() => navigateWithinTag(tagId, "right")}
      placeholder="..."
    />
  );
};

export default ArrayValueInput;
