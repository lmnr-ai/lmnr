import { memo } from "react";

import {
  type TraceViewListSpan,
  type TranscriptGroupInput,
  type TranscriptGroupSpan,
  type TranscriptListGroup,
} from "@/components/traces/trace-view/store/base";
import {
  AgentGroupHeader,
  GroupChildWrapper,
  InputItem,
  SpanItem,
} from "@/components/traces/trace-view/transcript/item";
import { type PreviewMap } from "@/components/traces/trace-view/transcript/item/collapsed-preview-block";

export type TranscriptRowData =
  | { type: "user-input" }
  | { type: "span"; span: TraceViewListSpan }
  | TranscriptListGroup
  | TranscriptGroupInput
  | TranscriptGroupSpan;

export interface TranscriptRowProps {
  row: TranscriptRowData;
  previews: PreviewMap;
  inputPreviews: PreviewMap;
  agentNames: Record<string, string | null | undefined>;
  userInput: string | null;
  isUserInputLoading: boolean;
  selectedSpanId?: string;
  expandedGroupIds: Set<string>;
  onSpanSelect: (span: TraceViewListSpan) => void;
  onToggleGroup: (groupId: string) => void;
}

function TranscriptRowInner({
  row,
  previews,
  inputPreviews,
  agentNames,
  userInput,
  isUserInputLoading,
  selectedSpanId,
  expandedGroupIds,
  onSpanSelect,
  onToggleGroup,
}: TranscriptRowProps) {
  switch (row.type) {
    case "user-input":
      return <InputItem text={userInput} isLoading={isUserInputLoading} />;

    case "group": {
      const collapsed = !expandedGroupIds.has(row.groupId);
      return (
        <AgentGroupHeader
          group={row}
          collapsed={collapsed}
          previews={previews}
          inputPreviews={inputPreviews}
          agentNames={agentNames}
          onToggle={() => onToggleGroup(row.groupId)}
        />
      );
    }

    case "group-input": {
      const inputText = inputPreviews[row.firstLlmSpanId] ?? null;
      const isLoadingInput = inputPreviews[row.firstLlmSpanId] === undefined;
      return (
        <GroupChildWrapper>
          <InputItem text={inputText} isLoading={isLoadingInput} inGroup />
        </GroupChildWrapper>
      );
    }

    case "group-span":
      return (
        <GroupChildWrapper isLast={row.isLast}>
          <SpanItem
            span={row.span}
            output={previews[row.span.spanId]}
            onSpanSelect={onSpanSelect}
            isSelected={selectedSpanId === row.span.spanId}
            inGroup
          />
        </GroupChildWrapper>
      );

    case "span":
      return (
        <SpanItem
          span={row.span}
          output={previews[row.span.spanId]}
          onSpanSelect={onSpanSelect}
          isSelected={selectedSpanId === row.span.spanId}
        />
      );
  }
}

// Compare only the preview/selection values the given row actually reads so an
// unrelated preview landing or selection change elsewhere doesn't re-render it.
function areTranscriptRowPropsEqual(prev: TranscriptRowProps, next: TranscriptRowProps) {
  if (prev.row !== next.row || prev.onSpanSelect !== next.onSpanSelect || prev.onToggleGroup !== next.onToggleGroup) {
    return false;
  }

  const row = next.row;
  switch (row.type) {
    case "user-input":
      return prev.userInput === next.userInput && prev.isUserInputLoading === next.isUserInputLoading;

    case "span":
    case "group-span": {
      const id = row.span.spanId;
      return prev.previews[id] === next.previews[id] && (prev.selectedSpanId === id) === (next.selectedSpanId === id);
    }

    case "group-input": {
      const id = row.firstLlmSpanId;
      return prev.inputPreviews[id] === next.inputPreviews[id];
    }

    case "group": {
      const prevCollapsed = !prev.expandedGroupIds.has(row.groupId);
      const nextCollapsed = !next.expandedGroupIds.has(row.groupId);
      if (prevCollapsed !== nextCollapsed) return false;

      const firstLlmSpanId = row.firstLlmSpanId;
      const outputSpanId = row.lastLlmSpanId ?? row.firstLlmSpanId;
      const nameKey = firstLlmSpanId ?? "";
      if (prev.agentNames[nameKey] !== next.agentNames[nameKey]) return false;
      if (nextCollapsed) {
        if (firstLlmSpanId && prev.inputPreviews[firstLlmSpanId] !== next.inputPreviews[firstLlmSpanId]) return false;
        if (outputSpanId && prev.previews[outputSpanId] !== next.previews[outputSpanId]) return false;
      }
      return true;
    }
  }
}

export const TranscriptRow = memo(TranscriptRowInner, areTranscriptRowPropsEqual);
