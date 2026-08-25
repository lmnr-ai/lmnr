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

/** Which span is selected, shared by the transcript, the timeline, the signal
 *  card's chips and the copy on the left — the last of which sits outside the
 *  panel, hence a context. ONE PROVIDER PER PANEL: mobile mounts two, and a
 *  shared one would let a chip in either scroll both transcripts. */
export const SpanSelectionProvider = ({ children }: { children: ReactNode }) => {
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const value = useMemo(() => ({ selectedSpanId, selectSpan: setSelectedSpanId }), [selectedSpanId]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
};

export const useSpanSelection = (): Selection => useContext(SelectionContext);
