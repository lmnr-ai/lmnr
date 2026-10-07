// Which cluster the section is focused on, as state the individual bands
// subscribe to.
//
// Hover moves on every pointer event and the strip draws every cluster at every
// level, so hover cannot live above the strip: one move would re-render the whole
// forest and the chart under it. Here each band reads only the booleans it styles
// itself off, and only the bands whose answer changed re-render.
"use client";

import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";

export type ClusterFocusState = {
  hoveredId: string | null;
};

export type ClusterFocusActions = {
  setHoveredId: (id: string | null) => void;
};

export type ClusterFocusStore = ClusterFocusState & ClusterFocusActions;

/** The shape a band needs to answer the focus questions about itself. */
interface FocusNode {
  id: string;
  isExtra?: boolean;
  /** Clusters a counter stands for — they have no band of their own. */
  extra?: { id: string }[];
}

/**
 * Every band is in exactly one of three states:
 *   hover   — the band being pointed at, or the pinned one
 *   default — no focus anywhere, or this band is under the focus
 *   muted   — some other cluster has the focus
 */
export interface NodeFocus {
  isFocus: boolean;
  inFocus: boolean;
  /** Counters only: the focused cluster is one of the ones folded in here. */
  holdsFocus: boolean;
}

// --- Selectors ---

// Selection is owned by the URL (`useClusterId`), so it is an ARGUMENT to every
// selector rather than a field of the store — a second copy could drift from the
// param that owns it.
export const getFocusId = (state: ClusterFocusStore, selectedId: string | null): string | null =>
  // Selection wins over hover: a click locks the focus in.
  selectedId ?? state.hoveredId;

export const getNodeFocus = (
  state: ClusterFocusStore,
  node: FocusNode,
  selectedId: string | null,
  ancestors: Map<string, Set<string>>
): NodeFocus => {
  const focusId = getFocusId(state, selectedId);
  const isFocus = focusId !== null && node.id === focusId;
  return {
    isFocus,
    inFocus: focusId === null || isFocus || (ancestors.get(node.id)?.has(focusId) ?? false),
    // The focus counts as "in here" if it IS one of the folded clusters or sits
    // under one — a deep link, or a leaf the fold dropped on resize. Matching only
    // the folded nodes themselves left the whole strip muted with nothing lit.
    holdsFocus:
      node.isExtra === true &&
      focusId !== null &&
      (node.extra?.some((n) => n.id === focusId || (ancestors.get(focusId)?.has(n.id) ?? false)) ?? false),
  };
};

// --- Store ---

export type ClusterFocusStoreApi = ReturnType<typeof createClusterFocusStore>;

export const createClusterFocusStore = () =>
  createStore<ClusterFocusStore>()((set) => ({
    hoveredId: null,
    // Same id is a no-op down to the object identity: the strip delegates hover
    // and so writes on every pointer move across a band, and a fresh state object
    // would wake every band's selector for nothing.
    setHoveredId: (hoveredId) => set((state) => (state.hoveredId === hoveredId ? state : { hoveredId })),
  }));

export const ClusterFocusContext = createContext<ClusterFocusStoreApi | null>(null);

export const useClusterFocusContext = <T,>(
  selector: (state: ClusterFocusStore) => T,
  equalityFn?: (a: T, b: T) => boolean
): T => {
  const store = useContext(ClusterFocusContext);
  if (!store) throw new Error("Missing ClusterFocusContext.Provider in the tree");
  return useStoreWithEqualityFn(store, selector, equalityFn);
};

export const ClusterFocusStoreProvider = ({ children }: PropsWithChildren) => {
  const [store] = useState(() => createClusterFocusStore());

  return <ClusterFocusContext.Provider value={store}>{children}</ClusterFocusContext.Provider>;
};
