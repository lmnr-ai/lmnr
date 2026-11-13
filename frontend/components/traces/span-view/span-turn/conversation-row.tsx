import { memo } from "react";

import { MessageWrapper } from "@/components/traces/span-view/common";
import { renderMessageContent } from "@/components/traces/span-view/messages";
import { canonicalRole, segmentMessageRole } from "@/lib/spans/turn";

import { type ConversationRow, type MessageAnchor, type SectionKey } from "./build-rows";
import ContextStack from "./context-stack";
import MessageLinkButton from "./message-link-button";
import NormalizedParts from "./normalized-parts";
import RowSearchScope from "./row-search-scope";
import SectionHeader, { type SectionFormat } from "./section-header";
import { type ActiveMatch, type ClaimReveal } from "./use-row-search-scope";

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
  /** Search match counts per part; undefined when the row has none. */
  hits?: readonly number[];
  /** The current search match, when it is in this row. */
  activeMatch?: ActiveMatch;
  claimReveal: ClaimReveal;
  /** Search matches folded inside a closed context card. */
  contextHits?: number;
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
  hits,
  activeMatch,
  claimReveal,
  contextHits,
}: ConversationRowProps) => {
  if (row.kind === "section") {
    return (
      <div data-index={index} ref={measureRef} className={ROW}>
        <RowSearchScope active={activeMatch} claim={claimReveal}>
          <SectionHeader
            title={SECTION_TITLES[row.section]}
            summary={row.summary}
            first={index === 0}
            {...formats[row.section]}
          />
        </RowSearchScope>
      </div>
    );
  }
  if (row.kind === "context") {
    return (
      <div data-index={index} ref={measureRef} className={ROW}>
        <ContextStack summary={row.summary} open={row.open} onToggle={onToggleContext} searchHits={contextHits} />
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
      <div className={row.grouped ? "pb-1.5" : "pb-4"}>
        <RowSearchScope active={activeMatch} claim={claimReveal}>
          <MessageWrapper
            role={role}
            maxHeight={row.maxHeight}
            defaultExpanded={row.defaultExpanded}
            highlighted={highlighted}
            hasMatches={!!hits}
            headerAction={onLinkMessage && <MessageLinkButton onCopy={() => onLinkMessage(row.anchor)} />}
          >
            {row.normalized ? (
              <NormalizedParts
                parts={row.normalized.parts}
                expandReasoning={row.source === "output"}
                presetKey={presetKey}
                messageIndex={index}
                hits={hits}
              />
            ) : (
              renderMessageContent(row.segment, row.localIndex, index, presetKey, toolNameMap)
            )}
          </MessageWrapper>
        </RowSearchScope>
      </div>
    </div>
  );
};

export default memo(ConversationRowView);
