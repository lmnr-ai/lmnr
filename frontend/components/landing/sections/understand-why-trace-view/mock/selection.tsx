"use client";

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

interface Selection {
  selectedSpanId: string | null;
  selectSpan: (spanId: string | null) => void;
}

/** Selecting is a no-op outside a provider — the standalone signal-event card
 *  renders its chips with nothing to select into. */
const NO_SELECTION: Selection = { selectedSpanId: null, selectSpan: () => {} };

const SelectionContext = createContext<Selection>(NO_SELECTION);

/**
 * Which span is selected, shared by the transcript, the condensed timeline, the
 * signal card's chips and the copy on the left of the section — four trees, one
 * of which sits outside the panel, which is why this is a context.
 *
 * It replaced the product's zustand trace-view store. That store carries panel
 * layout, zoom, subagent groups, signal tabs, browser sessions and a realtime
 * feed; the landing page only ever wrote one string to it.
 *
 * ONE PROVIDER PER PANEL. The mobile section mounts the panel twice, and a
 * shared provider would make a chip in one scroll the other one's transcript.
 */
export const SpanSelectionProvider = ({ children }: { children: ReactNode }) => {
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const value = useMemo(() => ({ selectedSpanId, selectSpan: setSelectedSpanId }), [selectedSpanId]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
};

export const useSpanSelection = (): Selection => useContext(SelectionContext);
