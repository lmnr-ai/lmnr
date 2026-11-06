import { memo, useCallback, useMemo, useRef } from "react";

import { CollapsibleRegistry } from "@/components/traces/span-view/collapsible";
import { buildToolNameMap } from "@/components/traces/span-view/messages";
import { useSpanSearchState } from "@/components/traces/span-view/span-search-context";

import { type ConversationRow, type MessageAnchor, type SectionKey } from "./build-rows";
import ConversationRowView, { type ConversationRowProps } from "./conversation-row";
import ScrollToBottom from "./scroll-to-bottom";
import { type SectionFormat } from "./section-header";
import StickyBand from "./sticky-band";
import { useAnchoredVirtualizer } from "./use-anchored-virtualizer";
import { useStickyBand } from "./use-sticky-band";

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
}

const ConversationList = ({ rows, linked, ...rowProps }: ConversationListProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const searchTerm = useSpanSearchState()?.searchTerm ?? "";

  // Only provider-rendered (non-normalized) rows read this map.
  const toolNameMap = useMemo(() => {
    if (!rows.some((row) => row.kind === "message" && !row.normalized)) return undefined;
    const segments = new Set(rows.flatMap((row) => (row.kind === "message" ? [row.segment] : [])));
    return new Map([...segments].flatMap((segment) => [...buildToolNameMap(segment)]));
  }, [rows]);

  const { virtualizer, items, premeasure, setContainer, highlightedIndex } = useAnchoredVirtualizer({
    scrollRef: parentRef,
    rows,
    linked,
    searching: !!searchTerm,
  });

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
    };
    return <ConversationRowView key={row.key} {...props} />;
  };

  return (
    <>
      <div
        ref={parentRef}
        className="size-full overflow-y-auto styled-scrollbar scrollbar-gutter-stable px-2"
        // The virtualizer corrects scrollTop itself; browser scroll anchoring would correct the same shifts again.
        style={{ contain: "strict", overflowAnchor: "none" }}
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
