"use client";

import { useCallback } from "react";
import { shallow } from "zustand/shallow";

import { useTraceViewStore } from "@/components/traces/trace-view/store";

// Production `selectSpanById` walks the `collapsed` ancestor chain (tree
// view), but the transcript hides subagent groups behind a *separate*
// `transcriptExpandedGroups` Set. Selecting a span inside a subagent
// without expanding its group silently resolves to "not in flatRows" — no
// scroll, no highlight. Helper expands the containing transcript group
// first, then delegates to selectSpanById. Shared by trace-bento's
// auto-flash effect and the left-column body links (Timeline band).
export const useSelectAndRevealSpan = () => {
  const { selectSpanById, getCondensedSubagentGroups, transcriptExpandedGroups, toggleTranscriptGroup } =
    useTraceViewStore(
      (state) => ({
        selectSpanById: state.selectSpanById,
        getCondensedSubagentGroups: state.getCondensedSubagentGroups,
        transcriptExpandedGroups: state.transcriptExpandedGroups,
        toggleTranscriptGroup: state.toggleTranscriptGroup,
      }),
      shallow
    );

  return useCallback(
    (spanId: string) => {
      const group = getCondensedSubagentGroups().find((g) => g.spanIds.includes(spanId));
      if (group && !transcriptExpandedGroups.has(group.groupId)) {
        toggleTranscriptGroup(group.groupId);
      }
      selectSpanById(spanId);
    },
    [getCondensedSubagentGroups, transcriptExpandedGroups, toggleTranscriptGroup, selectSpanById]
  );
};
