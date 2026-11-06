import { memo } from "react";

import { MessageWrapper } from "@/components/traces/span-view/common";
import { renderMessageContent } from "@/components/traces/span-view/messages";
import { canonicalRole, segmentMessageRole } from "@/lib/spans/turn";
import { cn } from "@/lib/utils";

import { type ConversationRow, type MessageAnchor, type SectionKey } from "./build-rows";
import ContextHeader from "./context-header";
import MessageLinkButton from "./message-link-button";
import NormalizedParts from "./normalized-parts";
import SectionHeader, { type SectionFormat } from "./section-header";

const SECTION_TITLES: Record<SectionKey, string> = { input: "Input", output: "Output" };

// The virtualizer positions each row itself (`directDomUpdates`).
const ROW = "absolute top-0 left-0 w-full";

export interface ConversationRowProps {
  row: ConversationRow;
  index: number;
  measureRef: (node: Element | null) => void;
  formats: Record<SectionKey, SectionFormat>;
  presetKey: string;
  toolNameMap?: Map<string, string>;
  highlighted: boolean;
  onToggleContext: () => void;
  onLinkMessage?: (anchor: MessageAnchor) => Promise<void>;
}

// Memoized with stable props: the virtualizer re-renders the list on every scroll update.
const ConversationRowView = ({
  row,
  index,
  measureRef,
  formats,
  presetKey,
  toolNameMap,
  highlighted,
  onToggleContext,
  onLinkMessage,
}: ConversationRowProps) => {
  if (row.kind === "section") {
    return (
      <div data-index={index} ref={measureRef} className={ROW}>
        <SectionHeader
          title={SECTION_TITLES[row.section]}
          summary={row.summary}
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
          onToggle={onToggleContext}
          copyText={formats.input.value}
        />
      </div>
    );
  }

  // Anthropic sends tool results as `user` messages; label them by what they are.
  const role = row.normalized?.parts.every((p) => p.kind === "tool-result")
    ? "tool"
    : (row.normalized?.role ?? segmentMessageRole(row.segment, row.localIndex));
  return (
    <div data-index={index} ref={measureRef} className={cn(ROW, "pb-4")}>
      <MessageWrapper
        role={canonicalRole(role)}
        presetKey={presetKey}
        maxHeight={row.maxHeight}
        defaultExpanded={row.defaultExpanded}
        stickyHeader={false}
        highlighted={highlighted}
        headerAction={onLinkMessage && <MessageLinkButton onCopy={() => onLinkMessage(row.anchor)} />}
      >
        {row.normalized ? (
          <NormalizedParts
            parts={row.normalized.parts}
            plainResults={row.plainResults}
            expandReasoning={row.source === "output"}
            presetKey={presetKey}
            messageIndex={index}
          />
        ) : (
          renderMessageContent(row.segment, row.localIndex, index, presetKey, toolNameMap)
        )}
      </MessageWrapper>
    </div>
  );
};

export default memo(ConversationRowView);
