import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { buildToolNameMap } from "@/components/traces/span-view/messages";
import { useSpanSearchState } from "@/components/traces/span-view/span-search-context";

import { type ConversationRow, type MessageAnchor, type NewInputStyle, type SectionKey } from "./build-rows";
import ConversationRowView, { type ConversationRowProps } from "./conversation-row";
import { findAnchorRow } from "./message-anchor";
import { type SectionFormat } from "./section-header";
import { usePremeasureAbove } from "./use-premeasure-above";
import { alignRow, useScrollToRow } from "./use-scroll-to-row";

const TOGGLE_ESTIMATE_SIZE = 40;
const MESSAGE_ESTIMATE_SIZE = 240;
const FLASH_MS = 2000;
const NEVER_ADJUST = () => false;

interface ConversationListProps {
  rows: ConversationRow[];
  compact: boolean;
  resultPreviews: boolean;
  newInputStyle: NewInputStyle;
  /** Messages without cards (Focused "Flat"). */
  bare: boolean;
  formats: Record<SectionKey, SectionFormat>;
  presetKey: string;
  onToggleHistory: () => void;
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

  // Read once: copying a link later must not move the list.
  const [linkedIndex] = useState(() => (linked ? findAnchorRow(rows, linked) : -1));
  const hold = useScrollToRow(parentRef, linkedIndex);

  const estimateSize = (i: number) => (rows[i]?.kind === "message" ? MESSAGE_ESTIMATE_SIZE : TOGGLE_ESTIMATE_SIZE);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    getItemKey: (i) => rows[i]?.key ?? i,
    overscan: searchTerm ? 100 : 10,
    // Start at the linked row's estimated spot, so the first frame isn't the top of the list.
    initialOffset: () =>
      Array.from({ length: Math.max(0, linkedIndex) }, (_, i) => estimateSize(i)).reduce((a, b) => a + b, 0),
    onChange: hold.onChange,
    // Rows move in the same tick as scrollTop corrections, so no frame paints old positions under a new scroll.
    directDomUpdates: true,
  });
  // Set during render so it already covers the first rows' measurements.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = hold.holding ? NEVER_ADJUST : undefined;
  useLayoutEffect(() => {
    if (linkedIndex >= 0) alignRow(virtualizer, linkedIndex);
  }, [linkedIndex, virtualizer]);

  const [flashing, setFlashing] = useState(linkedIndex >= 0);
  useEffect(() => {
    if (!flashing) return;
    const id = setTimeout(() => setFlashing(false), FLASH_MS);
    return () => clearTimeout(id);
  }, [flashing]);
  // A search renders 100 rows of overscan anyway.
  const premeasure = usePremeasureAbove(virtualizer, searchTerm ? -1 : linkedIndex);

  const renderRow = (index: number) => {
    const row = rows[index];
    const props: ConversationRowProps = {
      ...rowProps,
      row,
      index,
      measureRef: virtualizer.measureElement,
      toolNameMap,
      highlighted: flashing && index === linkedIndex,
    };
    return <ConversationRowView key={row.key} {...props} />;
  };

  return (
    <div
      ref={parentRef}
      className="size-full overflow-y-auto styled-scrollbar scrollbar-gutter-stable px-2"
      // The virtualizer corrects scrollTop itself; browser scroll anchoring would correct the same shifts again.
      style={{ contain: "strict", overflowAnchor: "none" }}
    >
      <div ref={virtualizer.containerRef} className="relative w-full">
        {premeasure.length > 0 && (
          <div aria-hidden className="invisible absolute inset-x-0 top-0 pointer-events-none">
            {premeasure.map(renderRow)}
          </div>
        )}
        {virtualizer.getVirtualItems().map((item) => renderRow(item.index))}
      </div>
    </div>
  );
};

export default memo(ConversationList);
