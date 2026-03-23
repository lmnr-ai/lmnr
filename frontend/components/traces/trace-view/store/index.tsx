import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore, type StoreApi, useStore } from "zustand";
import { persist } from "zustand/middleware";

import { type BaseTraceViewStore, createBaseTraceViewSlice, TraceViewContext, type TraceViewTrace } from "./base";

export {
  MAX_ZOOM,
  MIN_ZOOM,
  type TraceSignal,
  type TraceViewListSpan,
  type TraceViewSpan,
  type TraceViewTrace,
  ZOOM_INCREMENT,
} from "./base";

export const MIN_TREE_VIEW_WIDTH = 500;
export const DEFAULT_PANEL_WIDTH = 400;
export const MIN_PANEL_WIDTH = 200;

export type ResizablePanel = "trace" | "span" | "chat";

interface TraceViewStoreState {
  tracePanelWidth: number;
  spanPanelWidth: number;
  chatPanelWidth: number;
}

interface TraceViewStoreActions {
  resizePanel: (panel: ResizablePanel, delta: number) => void;
}

type TraceViewStore = BaseTraceViewStore & TraceViewStoreState & TraceViewStoreActions;

const createTraceViewStore = (initialTrace?: TraceViewTrace, storeKey?: string) =>
  createStore<TraceViewStore>()(
    persist(
      (set, get) => ({
        ...createBaseTraceViewSlice(set, get, { initialTrace }),

        tracePanelWidth: MIN_TREE_VIEW_WIDTH,
        spanPanelWidth: DEFAULT_PANEL_WIDTH,
        chatPanelWidth: DEFAULT_PANEL_WIDTH,

        resizePanel: (panel, delta) => {
          const state = get();
          // Visual order left-to-right: trace → span → chat
          // Propagation goes rightward when shrinking past min
          const panels: { key: keyof Pick<TraceViewStoreState, "tracePanelWidth" | "spanPanelWidth" | "chatPanelWidth">; min: number }[] = [
            { key: "tracePanelWidth", min: MIN_TREE_VIEW_WIDTH },
            { key: "spanPanelWidth", min: MIN_PANEL_WIDTH },
            { key: "chatPanelWidth", min: MIN_PANEL_WIDTH },
          ];

          const startIndex = panels.findIndex((p) => p.key === `${panel}PanelWidth`);
          if (startIndex === -1) return;

          const updates: Partial<TraceViewStoreState> = {};
          let remaining = delta;

          // Walk rightward from the target panel, propagating any overflow
          for (let i = startIndex; i < panels.length && remaining < 0; i++) {
            const { key, min } = panels[i];
            const current = state[key];
            const newWidth = Math.max(min, current + remaining);
            updates[key] = newWidth;
            // Whatever we couldn't absorb propagates to the next panel
            remaining = remaining - (newWidth - current);
          }

          // If delta is positive (growing), only apply to the target panel
          if (delta > 0) {
            const { key } = panels[startIndex];
            updates[key] = state[key] + delta;
          }

          set(updates);
        },
      }),
      {
        name: storeKey ?? "trace-view-state",
        partialize: (state) => {
          const persistentTabs = ["tree", "reader"] as const;
          const tabToPersist = persistentTabs.includes(state.tab as any) ? state.tab : undefined;

          return {
            tracePanelWidth: state.tracePanelWidth,
            spanPanelWidth: state.spanPanelWidth,
            chatPanelWidth: state.chatPanelWidth,
            spanPath: state.spanPath,
            spanTemplates: state.spanTemplates,
            ...(tabToPersist && { tab: tabToPersist }),
            showTreeContent: state.showTreeContent,
            condensedTimelineEnabled: state.condensedTimelineEnabled,
          };
        },
        merge: (persistedState, currentState) => {
          const persisted = (persistedState ?? {}) as Record<string, unknown>;
          const validTabs = ["tree", "reader"] as const;
          const tab =
            persisted.tab && validTabs.includes(persisted.tab as (typeof validTabs)[number])
              ? (persisted.tab as TraceViewStore["tab"])
              : currentState.tab;

          return {
            ...currentState,
            // Only pick keys that partialize actually produces — never overwrite functions
            ...(typeof persisted.tracePanelWidth === "number" && { tracePanelWidth: persisted.tracePanelWidth }),
            ...(typeof persisted.spanPanelWidth === "number" && { spanPanelWidth: persisted.spanPanelWidth }),
            ...(typeof persisted.chatPanelWidth === "number" && { chatPanelWidth: persisted.chatPanelWidth }),
            ...(Array.isArray(persisted.spanPath) && { spanPath: persisted.spanPath as string[] }),
            ...(persisted.spanTemplates !== undefined && {
              spanTemplates: persisted.spanTemplates as TraceViewStore["spanTemplates"],
            }),
            ...(typeof persisted.showTreeContent === "boolean" && { showTreeContent: persisted.showTreeContent }),
            ...(typeof persisted.condensedTimelineEnabled === "boolean" && {
              condensedTimelineEnabled: persisted.condensedTimelineEnabled,
            }),
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
  const [storeState] = useState(() => createTraceViewStore(initialTrace, storeKey));

  return (
    <TraceViewContext.Provider value={storeState}>
      <TraceViewStoreContext.Provider value={storeState}>{children}</TraceViewStoreContext.Provider>
    </TraceViewContext.Provider>
  );
};

export const useTraceViewStore = <T,>(
  selector: (store: TraceViewStore) => T,
  equalityFn?: (a: T, b: T) => boolean
): T => {
  const store = useContext(TraceViewStoreContext);
  if (!store) {
    throw new Error("useTraceViewStoreContext must be used within a TraceViewStoreContext");
  }

  return useStore(store, selector, equalityFn);
};

export default TraceViewStoreProvider;
