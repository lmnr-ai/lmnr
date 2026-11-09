import { type CSSProperties, memo, useCallback, useEffect, useMemo, useRef } from "react";

import { CollapsibleRegistry } from "@/components/traces/span-view/collapsible";
import { buildToolNameMap } from "@/components/traces/span-view/messages";

import { type ConversationRow, type MessageAnchor, type SectionKey } from "./build-rows";
import ConversationRowView, { type ConversationRowProps } from "./conversation-row";
import ScrollToBottom from "./scroll-to-bottom";
import { type TurnMatches } from "./search-index";
import { type SectionFormat } from "./section-header";
import StickyBand from "./sticky-band";
import { useAnchoredVirtualizer } from "./use-anchored-virtualizer";
import { useStickyBand } from "./use-sticky-band";
import { type ActiveRowMatch } from "./use-turn-search";

const BAND_HEIGHT = 48;

interface ConversationListProps {
  rows: ConversationRow[];
  formats: Record<SectionKey, SectionFormat>;
  presetKey: string;
  onToggleContext: () => void;
  /** The message the URL hash points at when the list mounts: scrolled to and briefly highlighted. */
  linked?: MessageAnchor;
  /** Omitted where a link couldn't reopen this span. */
  onLinkMessage?: (anchor: MessageAnchor) => Promise<void>;
  /** Search matches per row, from the span's text index; undefined while not searching. */
  matches?: TurnMatches;
  activeMatch?: ActiveRowMatch;
  /** Matches inside the folded context, shown on its card. */
  contextHits?: number;
}

const ConversationList = ({ rows, linked, matches, activeMatch, contextHits, ...rowProps }: ConversationListProps) => {
  const parentRef = useRef<HTMLDivElement>(null);

  // Only provider-rendered (non-normalized) rows read this map.
  const toolNameMap = useMemo(() => {
    if (!rows.some((row) => row.kind === "message" && !row.normalized)) return undefined;
    const segments = new Set(rows.flatMap((row) => (row.kind === "message" ? [row.segment] : [])));
    return new Map([...segments].flatMap((segment) => [...buildToolNameMap(segment)]));
  }, [rows]);

  const { virtualizer, items, premeasure, setContainer, highlightedIndex, releaseLinked } = useAnchoredVirtualizer({
    scrollRef: parentRef,
    rows,
    linked,
    searching: !!matches,
  });

  // Brings the current match's row into the range (mounting it); its editor then scrolls to the match itself.
  const scrolledNonce = useRef(0);
  useEffect(() => {
    if (!activeMatch || activeMatch.nonce === scrolledNonce.current) return;
    const index = rows.findIndex((row) => row.key === activeMatch.key);
    if (index < 0) return;
    scrolledNonce.current = activeMatch.nonce;
    releaseLinked();
    virtualizer.scrollToIndex(index, { align: "auto" });
  }, [activeMatch, rows, virtualizer, releaseLinked]);

  const claimedNonce = useRef(0);
  const claimReveal = useCallback(
    (nonce: number) => {
      if (nonce === claimedNonce.current) return false;
      claimedNonce.current = nonce;
      // Ends scrollToIndex's settling: it would pull the row's start back over the editor's scroll to the match.
      const el = virtualizer.scrollElement;
      if (el) virtualizer.scrollToOffset(el.scrollTop);
      return true;
    },
    [virtualizer]
  );

  const sticky = useStickyBand(parentRef, virtualizer, rows, BAND_HEIGHT, rowProps.onToggleContext);
  const scrollToBottom = useCallback(
    () => virtualizer.scrollToIndex(rows.length - 1, { align: "end" }),
    [virtualizer, rows.length]
  );

  const renderRow = (index: number) => {
    const row = rows[index];
    const props: ConversationRowProps = {
      ...rowProps,
      row,
      index,
      measureRef: virtualizer.measureElement,
      toolNameMap,
      highlighted: index === highlightedIndex,
      hits: matches?.byRow.get(row.key),
      activeMatch: activeMatch?.key === row.key ? activeMatch : undefined,
      claimReveal,
      contextHits: row.kind === "context" && !row.open ? contextHits : undefined,
    };
    return <ConversationRowView key={row.key} {...props} />;
  };

  return (
    <>
      <div
        ref={parentRef}
        className="size-full overflow-y-auto styled-scrollbar scrollbar-gutter-stable px-2"
        // The virtualizer corrects scrollTop itself; browser scroll anchoring would correct the same shifts again.
        style={{ contain: "strict", overflowAnchor: "none", "--band-inset": `${sticky.inset}px` } as CSSProperties}
      >
        <StickyBand
          band={sticky.band}
          item={sticky.item}
          onCollapseContext={sticky.collapseContext}
          onCollapseItem={sticky.collapseItem}
        />
        <CollapsibleRegistry value={sticky.registry}>
          <div ref={setContainer} className="relative w-full">
            {premeasure.length > 0 && (
              <div aria-hidden className="invisible absolute inset-x-0 top-0 pointer-events-none">
                {premeasure.map(renderRow)}
              </div>
            )}
            {items.map(renderRow)}
          </div>
        </CollapsibleRegistry>
      </div>
      <ScrollToBottom scrollRef={parentRef} onClick={scrollToBottom} />
    </>
  );
};

export default memo(ConversationList);
