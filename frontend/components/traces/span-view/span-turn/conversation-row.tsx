import { memo } from "react";

import { MessageWrapper } from "@/components/traces/span-view/common";
import { renderMessageContent } from "@/components/traces/span-view/messages";
import { canonicalRole, segmentMessageRole } from "@/lib/spans/turn";
import { cn } from "@/lib/utils";

import { type ConversationRow, isContextRow, type MessageAnchor, type SectionKey } from "./build-rows";
import ContextStack from "./context-stack";
import MessageLinkButton from "./message-link-button";
import NormalizedParts from "./normalized-parts";
import SectionHeader, { SECTION_TITLES, type SectionFormat } from "./section-header";

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
        <ContextStack summary={row.summary} open={row.open} onToggle={onToggleContext} />
      </div>
    );
  }

  // Anthropic sends tool results as `user` messages; label them by what they are.
  const role = canonicalRole(
    row.normalized?.parts.every((p) => p.kind === "tool-result")
      ? "tool"
      : (row.normalized?.role ?? segmentMessageRole(row.segment, row.localIndex))
  );
  return (
    <div data-index={index} ref={measureRef} className={ROW}>
      <div className={cn("pb-4", isContextRow(row) && "ml-1.5 pl-3 border-l")}>
        <MessageWrapper
          role={role}
          maxHeight={row.maxHeight}
          defaultExpanded={row.defaultExpanded}
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
    </div>
  );
};

export default memo(ConversationRowView);
