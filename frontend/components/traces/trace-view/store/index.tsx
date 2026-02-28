import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore, type StoreApi, useStore } from "zustand";
import { persist } from "zustand/middleware";

import { type BaseTraceViewStore, createBaseTraceViewSlice, TraceViewContext, type TraceViewTrace } from "./base";

export {
  MAX_ZOOM,
  MIN_ZOOM,
  type TraceViewListSpan,
  type TraceViewSpan,
  type TraceViewTrace,
  ZOOM_INCREMENT,
} from "./base";

export const MIN_TREE_VIEW_WIDTH = 500;

interface TraceViewStoreState {
  treeWidth: number;
}

interface TraceViewStoreActions {
  setTreeWidth: (width: number) => void;
}

type TraceViewStore = BaseTraceViewStore & TraceViewStoreState & TraceViewStoreActions;

const createTraceViewStore = (initialTrace?: TraceViewTrace, storeKey?: string) =>
  createStore<TraceViewStore>()(
    persist(
      (set, get) => ({
        ...createBaseTraceViewSlice(set, get, { initialTrace }),

        treeWidth: MIN_TREE_VIEW_WIDTH,
        setTreeWidth: (treeWidth) => set({ treeWidth }),
      }),
      {
        name: storeKey ?? "trace-view-state",
        partialize: (state) => {
          const persistentTabs = ["tree", "reader"] as const;
          const tabToPersist = persistentTabs.includes(state.tab as any) ? state.tab : undefined;

          return {
            treeWidth: state.treeWidth,
            spanPath: state.spanPath,
            spanTemplates: state.spanTemplates,
            ...(tabToPersist && { tab: tabToPersist }),
            showTreeContent: state.showTreeContent,
            condensedTimelineEnabled: state.condensedTimelineEnabled,
          };
        },
        merge: (persistedState, currentState) => {
          const persisted = persistedState as Partial<TraceViewStore>;
          const validTabs = ["tree", "reader"] as const;
          const tab = persisted.tab && validTabs.includes(persisted.tab as any) ? persisted.tab : currentState.tab;

          return {
            ...currentState,
            ...persisted,
            tab,
          };
        },
      }
    )
  );

const TraceViewStoreContext = createContext<StoreApi<TraceViewStore> | undefined>(undefined);

const TraceViewStoreProvider = ({
  children,
  initialTrace,
  storeKey,
}: PropsWithChildren<{ initialTrace?: TraceViewTrace; storeKey?: string }>) => {
  const [storeState] = useState(createTraceViewStore(initialTrace, storeKey));

  return (
    <TraceViewContext.Provider value={storeState}>
      <TraceViewStoreContext.Provider value={storeState}>{children}</TraceViewStoreContext.Provider>
    </TraceViewContext.Provider>
  );
};

export const useTraceViewStore = <T,>(selector: (store: TraceViewStore) => T): T => {
  const store = useContext(TraceViewStoreContext);
  if (!store) {
    throw new Error("useTraceViewStoreContext must be used within a TraceViewStoreContext");
  }

  return useStore(store, selector);
};

export default TraceViewStoreProvider;
