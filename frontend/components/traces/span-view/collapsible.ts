import { createContext, type RefObject, useContext, useEffect } from "react";

/** An expanded part the sticky band can name and fold while its own toggle is scrolled away. */
export interface CollapsibleEntry {
  /** Role of the message card it sits in. */
  role?: string;
  /** What the part is within that card, e.g. a tool name; plain text needs none. */
  label?: string;
  action: string;
  collapse: () => void;
}

export interface ActiveCollapsible {
  element: Element;
  entry: CollapsibleEntry;
}

/** Expanded parts by root element; absent outside the span conversation list, where there's no band. */
export const CollapsibleRegistry = createContext<Map<Element, CollapsibleEntry> | null>(null);

/** The enclosing message card's role, for the band's header. */
export const MessageRole = createContext<string | undefined>(undefined);

/** Registers the part while `active` (expanded by the user, not forced open by search, which it can't fold). */
export const useCollapsible = (
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  label: string | undefined,
  action: string,
  collapse: () => void
) => {
  const registry = useContext(CollapsibleRegistry);
  const role = useContext(MessageRole);
  useEffect(() => {
    const el = ref.current;
    if (!registry || !el || !active) return;
    registry.set(el, { role, label, action, collapse });
    return () => {
      registry.delete(el);
    };
  }, [registry, ref, active, role, label, action, collapse]);
};

// The pinned header's height: with less of the part left below the band, the header would cover its end.
const PINNED_HEADER = 32;

/**
 * The innermost expanded part whose top has scrolled under the band's section / context line (measured: the context
 * card is taller than a section title), so its own header is hidden there.
 */
export const collapsibleAt = (
  scroller: HTMLElement,
  registry: Map<Element, CollapsibleEntry>
): ActiveCollapsible | undefined => {
  if (registry.size === 0) return undefined;
  const rect = scroller.getBoundingClientRect();
  const y = (scroller.querySelector("[data-sticky-band-base]")?.getBoundingClientRect().bottom ?? rect.top) + 1;
  const hit = document
    .elementsFromPoint(rect.left + rect.width / 2, y)
    .find((node) => scroller.contains(node) && !node.closest("[data-sticky-band]"));
  for (let node = hit ?? null; node && node !== scroller; node = node.parentElement) {
    const entry = registry.get(node);
    const box = entry && node.getBoundingClientRect();
    if (entry && box && box.top < y && box.bottom > y + PINNED_HEADER) return { element: node, entry };
  }
};
