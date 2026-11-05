import { memo } from "react";

import { MessageWrapper } from "@/components/traces/span-view/common";
import MessageLabelRow from "@/components/traces/span-view/message-label-row";
import { renderMessageContent } from "@/components/traces/span-view/messages";
import { canonicalRole, segmentMessageRole } from "@/lib/spans/turn";
import { cn, pluralize } from "@/lib/utils";

import { type ConversationRow, type MessageAnchor, type NewInputStyle, type SectionKey } from "./build-rows";
import ContextHeader from "./context-header";
import MessageLinkButton from "./message-link-button";
import NewInputFrame from "./new-input-frame";
import NormalizedParts from "./normalized-parts";
import SectionHeader, { type SectionFormat } from "./section-header";

const SECTION_TITLES: Record<SectionKey, string> = { input: "Input", output: "Output" };
const SECTION_INFO: Partial<Record<SectionKey, string>> = {
  input:
    "Each LLM call re-sends the whole conversation. Earlier steps are collapsed, and the marked part is what is new in this call.",
};

// The virtualizer positions each row itself (`directDomUpdates`).
const ROW = "absolute top-0 left-0 w-full";

export interface ConversationRowProps {
  row: ConversationRow;
  index: number;
  measureRef: (node: Element | null) => void;
  compact: boolean;
  resultPreviews: boolean;
  newInputStyle: NewInputStyle;
  bare: boolean;
  formats: Record<SectionKey, SectionFormat>;
  presetKey: string;
  toolNameMap?: Map<string, string>;
  highlighted: boolean;
  onToggleHistory: () => void;
  onLinkMessage?: (anchor: MessageAnchor) => Promise<void>;
}

// Memoized with stable props: the virtualizer re-renders the list on every scroll update.
const ConversationRowView = ({
  row,
  index,
  measureRef,
  compact,
  resultPreviews,
  newInputStyle,
  bare,
  formats,
  presetKey,
  toolNameMap,
  highlighted,
  onToggleHistory,
  onLinkMessage,
}: ConversationRowProps) => {
  if (row.kind === "section") {
    return (
      <div data-index={index} ref={measureRef} className={ROW}>
        <SectionHeader
          title={SECTION_TITLES[row.section]}
          summary={row.summary}
          info={row.info ? SECTION_INFO[row.section] : undefined}
          messageIndex={index}
          first={index === 0}
          {...formats[row.section]}
        />
      </div>
    );
  }
  if (row.kind === "context") {
    return (
      <div data-index={index} ref={measureRef} className={ROW}>
        <ContextHeader
          summary={row.summary}
          open={row.open}
          onToggle={onToggleHistory}
          copyText={formats.input.value}
        />
      </div>
    );
  }
  if (row.kind === "new-input") {
    return (
      <div data-index={index} ref={measureRef} className={cn(ROW, "flex items-center gap-1.5 px-1 pb-3 text-xs")}>
        <span className="font-medium text-secondary-foreground">{row.label.title}</span>
        {row.label.detail && <span className="text-muted-foreground">· {row.label.detail}</span>}
        <div className="flex-1 ml-1 border-t border-dashed" />
      </div>
    );
  }
  if (row.kind === "toggle") {
    return (
      // Bottom-only spacing, like message rows, so the gaps above and below the toggle match.
      <div data-index={index} ref={measureRef} className={cn(ROW, "pb-4")}>
        <MessageLabelRow text={row.text} open={row.open} onToggle={onToggleHistory} />
      </div>
    );
  }

  const parts = row.normalized?.parts;
  // Anthropic sends tool results as `user` messages; label them by what they are.
  const role = parts?.every((p) => p.kind === "tool-result")
    ? "tool"
    : (row.normalized?.role ?? segmentMessageRole(row.segment, row.localIndex));
  const framed = row.newInput && newInputStyle !== "divider";
  const card = (
    <MessageWrapper
      role={canonicalRole(role)}
      suffix={row.resultCount ? pluralize(row.resultCount, "result", "results") : undefined}
      presetKey={presetKey}
      maxHeight={row.maxHeight}
      defaultExpanded={row.defaultExpanded}
      stickyHeader={false}
      bare={bare}
      highlighted={highlighted}
      headerAction={onLinkMessage && <MessageLinkButton onCopy={() => onLinkMessage(row.anchor)} />}
    >
      {row.normalized ? (
        <NormalizedParts
          parts={row.normalized.parts}
          compact={compact}
          resultPreviews={resultPreviews || !!row.plainResults}
          plainResults={row.plainResults}
          expandReasoning={row.source === "output"}
          presetKey={presetKey}
          messageIndex={index}
        />
      ) : (
        renderMessageContent(row.segment, row.localIndex, index, presetKey, toolNameMap)
      )}
    </MessageWrapper>
  );
  return (
    <div data-index={index} ref={measureRef} className={cn(ROW, !framed && "pb-4")}>
      {framed && row.newInput ? (
        <NewInputFrame style={newInputStyle} position={row.newInput}>
          {card}
        </NewInputFrame>
      ) : (
        card
      )}
    </div>
  );
};

export default memo(ConversationRowView);
