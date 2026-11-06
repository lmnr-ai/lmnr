import { elementScroll, useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useMemo, useRef } from "react";

import { buildToolNameMap } from "@/components/traces/span-view/messages";
import { useSpanSearchState } from "@/components/traces/span-view/span-search-context";

import { type ConversationRow, type MessageAnchor, type SectionKey } from "./build-rows";
import ConversationRowView, { type ConversationRowProps } from "./conversation-row";
import { type SectionFormat } from "./section-header";
import { useLinkedRow } from "./use-linked-row";
import { usePremeasureAbove } from "./use-premeasure-above";

const HEADER_ESTIMATE_SIZE = 40;
const MESSAGE_ESTIMATE_SIZE = 240;
const NEVER_ADJUST = () => false;

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchTerm = useSpanSearchState()?.searchTerm ?? "";

  // Only provider-rendered (non-normalized) rows read this map.
  const toolNameMap = useMemo(() => {
    if (!rows.some((row) => row.kind === "message" && !row.normalized)) return undefined;
    const segments = new Set(rows.flatMap((row) => (row.kind === "message" ? [row.segment] : [])));
    return new Map([...segments].flatMap((segment) => [...buildToolNameMap(segment)]));
  }, [rows]);

  const estimateSize = (i: number) => (rows[i]?.kind === "message" ? MESSAGE_ESTIMATE_SIZE : HEADER_ESTIMATE_SIZE);
  const linkedRow = useLinkedRow(parentRef, rows, linked, estimateSize);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    getItemKey: (i) => rows[i]?.key ?? i,
    overscan: searchTerm ? 100 : 10,
    initialOffset: linkedRow.initialOffset,
    onChange: linkedRow.onChange,
    // Grow the container before a size correction scrolls: near the end of the list the browser would otherwise clamp
    // it to the old height, and the cut-off part shows as a jump once the container grows.
    scrollToFn: (offset, options, instance) => {
      if (containerRef.current) containerRef.current.style.height = `${instance.getTotalSize()}px`;
      elementScroll(offset, options, instance);
    },
    // Rows move in the same tick as scrollTop corrections, so no frame paints old positions under a new scroll.
    directDomUpdates: true,
  });
  // Set during render so it already covers the first rows' measurements.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = linkedRow.holding ? NEVER_ADJUST : undefined;
  const setContainer = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      virtualizer.containerRef(node);
    },
    [virtualizer]
  );

  const premeasure = usePremeasureAbove(virtualizer, linkedRow.index, !!searchTerm);

  const renderRow = (index: number) => {
    const row = rows[index];
    const props: ConversationRowProps = {
      ...rowProps,
      row,
      index,
      measureRef: virtualizer.measureElement,
      toolNameMap,
      highlighted: linkedRow.holding && index === linkedRow.index,
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
      <div ref={setContainer} className="relative w-full">
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
