import { type Virtualizer } from "@tanstack/react-virtual";
import { type RefObject, useCallback, useEffect, useState } from "react";

import {
  type ActiveCollapsible,
  type CollapsibleEntry,
  collapsibleAt,
} from "@/components/traces/span-view/collapsible";

import { type ConversationRow, isContextRow } from "./build-rows";

/** The opened context card, pinned while the view is inside the context. */
export interface Band {
  index: number;
  summary: string;
}

interface Extent {
  start: number;
}

const inOpenContext = (row: ConversationRow) =>
  (row.kind === "context" && row.open) || (row.kind === "message" && isContextRow(row));

/**
 * The band for a scroll position: none outside the opened context, while its card is still fully in view, or once the
 * first new message is about to reach the top.
 */
const bandAt = (rows: ConversationRow[], items: Extent[], scrollTop: number, height: number): Band | undefined => {
  // Last row starting at or above the top edge.
  let top = -1;
  for (let lo = 0, hi = Math.min(rows.length, items.length) - 1; lo <= hi;) {
    const mid = (lo + hi) >>> 1;
    if (items[mid].start <= scrollTop) [top, lo] = [mid, mid + 1];
    else hi = mid - 1;
  }
  if (top < 0 || !inOpenContext(rows[top])) return undefined;

  const index = rows.slice(0, top + 1).findLastIndex((row) => row.kind === "context");
  const header = rows[index];
  if (header?.kind !== "context" || (index === top && scrollTop <= items[top].start)) return undefined;

  const next = rows.findIndex((row, i) => i > top && !inOpenContext(row));
  if (next >= 0 && items[next] && items[next].start - scrollTop < height) return undefined;

  return { index, summary: header.summary };
};

const sameBand = (a?: Band, b?: Band) => a?.index === b?.index && a?.summary === b?.summary;

const sameItem = (a?: ActiveCollapsible, b?: ActiveCollapsible) => a?.element === b?.element && a?.entry === b?.entry;

/**
 * Tracks what the band shows on scroll (with direct DOM updates the list itself only re-renders when its range
 * changes): the opened context card while the view is inside it, and the expanded part the view is inside, if any.
 */
export const useStickyBand = (
  scrollRef: RefObject<HTMLDivElement | null>,
  virtualizer: Virtualizer<HTMLDivElement, Element>,
  rows: ConversationRow[],
  height: number,
  onToggleContext: () => void
) => {
  const [registry] = useState(() => new Map<Element, CollapsibleEntry>());
  const [band, setBand] = useState<Band>();
  const [item, setItem] = useState<ActiveCollapsible>();

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const nextBand = bandAt(rows, virtualizer.measurementsCache, el.scrollTop, height);
      const nextItem = collapsibleAt(el, registry);
      setBand((prev) => (sameBand(prev, nextBand) ? prev : nextBand));
      setItem((prev) => (sameItem(prev, nextItem) ? prev : nextItem));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [scrollRef, virtualizer, rows, height, registry]);

  // Each fold first scrolls back to what it folds: that sits above everything that goes away, so the view stays put.
  const collapseContext = useCallback(() => {
    const start = band ? virtualizer.measurementsCache[band.index]?.start : undefined;
    if (start !== undefined) virtualizer.scrollToOffset(start);
    onToggleContext();
  }, [band, virtualizer, onToggleContext]);

  const collapseItem = useCallback(() => {
    const el = scrollRef.current;
    if (!item || !el) return;
    // Land the part's own header just under the context card, if that is pinned.
    const base = el.querySelector("[data-sticky-band-base]")?.getBoundingClientRect().height ?? 0;
    const top = item.element.getBoundingClientRect().top - el.getBoundingClientRect().top;
    virtualizer.scrollToOffset(el.scrollTop + top - base);
    item.entry.collapse();
  }, [item, scrollRef, virtualizer]);

  return { registry, band, item, collapseContext, collapseItem };
};
