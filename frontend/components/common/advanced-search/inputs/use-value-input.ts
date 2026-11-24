import { useCallback } from "react";

import { useAdvancedSearchContext, useAdvancedSearchNavigation, useAdvancedSearchRefsContext, useTag } from "../store";
import { type FocusMode } from "../types";

export const useValueInput = (tagId: string, mode?: FocusMode) => {
  const tag = useTag(tagId);
  const { updateTagValue, submit } = useAdvancedSearchContext((state) => ({
    updateTagValue: state.updateTagValue,
    submit: state.submit,
  }));
  const { mainInputRef } = useAdvancedSearchRefsContext();
  const { navigateWithinTag } = useAdvancedSearchNavigation();

  const setValue = useCallback((value: string | string[]) => updateTagValue(tagId, value), [tagId, updateTagValue]);

  const complete = useCallback(() => {
    submit();
    mainInputRef.current?.focus();
  }, [submit, mainInputRef]);

  const commitOnBlur = useCallback(() => {
    if (mode === "edit") queueMicrotask(submit);
  }, [mode, submit]);

  const navigateLeft = useCallback(() => navigateWithinTag(tagId, "left"), [navigateWithinTag, tagId]);
  const navigateRight = useCallback(() => navigateWithinTag(tagId, "right"), [navigateWithinTag, tagId]);

  return { tag, setValue, complete, commitOnBlur, navigateLeft, navigateRight };
};
