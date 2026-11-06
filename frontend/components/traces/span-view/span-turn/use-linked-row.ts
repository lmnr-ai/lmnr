import { type Virtualizer } from "@tanstack/react-virtual";
import { type RefObject, useCallback, useEffect, useState } from "react";

import { type ConversationRow, type MessageAnchor } from "./build-rows";
import { findAnchorRow } from "./message-anchor";

const SETTLE_MS = 2000;
const USER_INPUT = ["wheel", "pointerdown", "keydown", "touchstart"] as const;

/**
 * Lands the list on the linked message: starts at its estimated offset, then puts it back at the top (below `inset`,
 * whatever pins over the top there) after every measurement (`onChange` runs before paint) until SETTLE_MS pass or the
 * user does anything. While `holding`, the virtualizer's own size corrections must be off: they read a scroll offset
 * that lags the jump by a frame.
 */
export const useLinkedRow = (
  scrollRef: RefObject<HTMLDivElement | null>,
  rows: ConversationRow[],
  linked: MessageAnchor | undefined,
  estimateSize: (index: number) => number,
  inset: (virtualizer: Virtualizer<HTMLDivElement, Element>, index: number) => number
) => {
  // Resolved once: copying a link later must not move the list.
  const [index] = useState(() => (linked ? findAnchorRow(rows, linked) : -1));
  const [holding, setHolding] = useState(index >= 0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!holding || !el) return;
    const release = () => setHolding(false);
    const timer = setTimeout(release, SETTLE_MS);
    USER_INPUT.forEach((event) => el.addEventListener(event, release, { passive: true }));
    return () => {
      clearTimeout(timer);
      USER_INPUT.forEach((event) => el.removeEventListener(event, release));
    };
  }, [holding, scrollRef]);

  const onChange = useCallback(
    (virtualizer: Virtualizer<HTMLDivElement, Element>) => {
      const start = holding ? virtualizer.getOffsetForIndex(index, "start")?.[0] : undefined;
      const target = start === undefined ? undefined : Math.max(0, start - inset(virtualizer, index));
      const el = virtualizer.scrollElement;
      if (target !== undefined && el && Math.abs(el.scrollTop - target) > 1) virtualizer.scrollToOffset(target);
    },
    [holding, index, inset]
  );

  const initialOffset = () =>
    Array.from({ length: Math.max(0, index) }, (_, i) => estimateSize(i)).reduce((a, b) => a + b, 0);

  return { index, holding, onChange, initialOffset };
};
