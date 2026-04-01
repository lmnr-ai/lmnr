import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore, type StoreApi } from "zustand";
import { persist } from "zustand/middleware";
import { useStoreWithEqualityFn } from "zustand/traditional";

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

export type ResizablePanel = "trace" | "span" | "chat";

type PanelWidthKey = "tracePanelWidth" | "spanPanelWidth" | "chatPanelWidth";
type PanelDef = { key: PanelWidthKey; min: number; default: number };

const ALL_PANELS: PanelDef[] = [
  { key: "tracePanelWidth", min: 400, default: 500 },
  { key: "spanPanelWidth", min: 400, default: 405 },
  { key: "chatPanelWidth", min: 375, default: 385 },
];

interface TraceViewStoreState {
  tracePanelWidth: number;
  spanPanelWidth: number;
  chatPanelWidth: number;
  maxWidth: number;
}

interface TraceViewStoreActions {
  resizePanel: (panel: ResizablePanel, delta: number) => void;
  setMaxWidth: (maxWidth: number) => void;
  fitPanelsToMaxWidth: () => void;
}

type TraceViewStore = BaseTraceViewStore & TraceViewStoreState & TraceViewStoreActions;

/** Determine which panels are currently visible based on store state. */
function getVisiblePanels(state: TraceViewStore): PanelDef[] {
  const result: PanelDef[] = [ALL_PANELS[0]]; // trace always visible

  if (state.spanPanelOpen || (state.isAlwaysSelectSpan && state.spans.length > 0)) result.push(ALL_PANELS[1]);

  if (state.tracesAgentOpen) result.push(ALL_PANELS[2]);

  return result;
}

/** Distribute a deficit proportionally across panels based on their budget above minimum.
 *  If all panels are at minimum, falls back to proportional shrinking below minimums. */
function distributeDeficit(
  state: TraceViewStore,
  visiblePanels: PanelDef[],
  deficit: number
): Partial<TraceViewStoreState> {
  const updates: Partial<TraceViewStoreState> = {};
  const budgets = visiblePanels.map((p) => ({
    key: p.key,
    min: p.min,
    width: state[p.key],
    budget: state[p.key] - p.min,
  }));
  const totalBudget = budgets.reduce((sum, b) => sum + b.budget, 0);

  if (totalBudget > 0) {
    // Preferred: shrink panels proportionally to their budget above minimum
    let remaining = deficit;
    for (const b of budgets) {
      const share = Math.min(b.budget, Math.round(deficit * (b.budget / totalBudget)));
      const actual = Math.min(share, remaining);
      updates[b.key] = b.width - actual;
      remaining -= actual;
    }
    // Absorb rounding remainder
    if (remaining > 0) {
      for (let i = budgets.length - 1; i >= 0 && remaining > 0; i--) {
        const b = budgets[i];
        const current = (updates[b.key] as number) ?? b.width;
        const absorb = Math.min(remaining, current - b.min);
        updates[b.key] = current - absorb;
        remaining -= absorb;
      }
    }
  } else {
    // Fallback: all at minimum, shrink proportionally below minimums
    const totalWidth = budgets.reduce((sum, b) => sum + b.width, 0);
    if (totalWidth <= 0) return updates;
    let remaining = deficit;
    for (const b of budgets) {
      const share = Math.round(deficit * (b.width / totalWidth));
      const actual = Math.min(share, remaining);
      updates[b.key] = b.width - actual;
      remaining -= actual;
    }
    // Absorb rounding remainder from last panel
    if (remaining > 0) {
      const last = budgets[budgets.length - 1];
      updates[last.key] = ((updates[last.key] as number) ?? last.width) - remaining;
    }
  }

  return updates;
}

const createTraceViewStore = (options?: {
  initialTrace?: TraceViewTrace;
  storeKey?: string;
  isAlwaysSelectSpan?: boolean;
  initialSignalId?: string;
  initialChatOpen?: boolean;
}) =>
  createStore<TraceViewStore>()(
    persist(
      (set, get) => {
        const baseSlice = createBaseTraceViewSlice<TraceViewStore>(set, get, {
          initialTrace: options?.initialTrace,
          isAlwaysSelectSpan: options?.isAlwaysSelectSpan,
          initialSignalId: options?.initialSignalId,
          initialChatOpen: options?.initialChatOpen,
        });

        return {
          ...baseSlice,

          tracePanelWidth: ALL_PANELS[0].default,
          spanPanelWidth: ALL_PANELS[1].default,
          chatPanelWidth: ALL_PANELS[2].default,
          maxWidth: Infinity,

          setMaxWidth: (maxWidth: number) => {
            const current = get().maxWidth;
            if (Math.abs(maxWidth - current) < 1) return; // guard against loops
            set({ maxWidth } as Partial<TraceViewStore>);
            get().fitPanelsToMaxWidth();
          },

          fitPanelsToMaxWidth: () => {
            const state = get();
            if (state.maxWidth === Infinity) return;

            const visible = getVisiblePanels(state);
            const total = visible.reduce((sum, p) => sum + state[p.key], 0);
            if (total <= state.maxWidth) return;

            const deficit = total - state.maxWidth;
            const updates = distributeDeficit(state, visible, deficit);
            set(updates as Partial<TraceViewStore>);
          },

          resizePanel: (panel: ResizablePanel, delta: number) => {
            const state = get();
            const visible = getVisiblePanels(state);

            const targetKey = `${panel}PanelWidth` as PanelWidthKey;
            const startIndex = visible.findIndex((p) => p.key === targetKey);
            if (startIndex === -1) {
              return;
            }

            const updates: Partial<TraceViewStoreState> = {};

            if (delta > 0) {
              // GROW: apply delta to target, then cascade-shrink LEFT to fit maxWidth
              const newTargetWidth = state[targetKey] + delta;
              updates[targetKey] = newTargetWidth;

              // Compute total with the update applied
              let total = 0;
              for (const p of visible) {
                total += (updates[p.key] as number) ?? state[p.key];
              }

              let overflow = total - state.maxWidth;
              if (overflow > 0) {
                // Walk LEFT from target, shrinking each panel to its minimum
                for (let i = startIndex - 1; i >= 0 && overflow > 0; i--) {
                  const { key, min } = visible[i];
                  const current = (updates[key] as number) ?? state[key];
                  const shrinkable = Math.max(0, current - min);
                  const shrinkAmount = Math.min(shrinkable, overflow);
                  updates[key] = current - shrinkAmount;
                  overflow -= shrinkAmount;
                }

                // If still overflow, cap the target's growth
                if (overflow > 0) {
                  updates[targetKey] = (updates[targetKey] as number) - overflow;
                }
              }
            } else if (delta < 0) {
              // SHRINK: clamp to min, propagate overflow RIGHTWARD
              let remaining = delta;
              for (let i = startIndex; i < visible.length && remaining < 0; i++) {
                const { key, min } = visible[i];
                const current = state[key];
                const newWidth = Math.max(min, current + remaining);
                updates[key] = newWidth;
                remaining -= newWidth - current;
              }
            }

            set(updates as Partial<TraceViewStore>);
          },

          // Override visibility-changing actions to auto-fit after
          setSelectedSpan: (span) => {
            baseSlice.setSelectedSpan(span);
            get().fitPanelsToMaxWidth();
          },

          setSpanPanelOpen: (open) => {
            baseSlice.setSpanPanelOpen(open);
            get().fitPanelsToMaxWidth();
          },

          setTracesAgentOpen: (open) => {
            baseSlice.setTracesAgentOpen(open);
            get().fitPanelsToMaxWidth();
          },
        };
      },
      {
        name: options?.storeKey ?? "trace-view-state",
        partialize: (state) => {
          const persistentTabs = ["tree", "reader"] as const;
          const tabToPersist = persistentTabs.includes(state.tab as any) ? state.tab : undefined;

          return {
            tracePanelWidth: state.tracePanelWidth,
            spanPanelWidth: state.spanPanelWidth,
            chatPanelWidth: state.chatPanelWidth,
            spanPath: state.spanPath,
            ...(tabToPersist && { tab: tabToPersist }),
            showTreeContent: state.showTreeContent,
            condensedTimelineEnabled: state.condensedTimelineEnabled,
            spanPanelOpen: state.spanPanelOpen,
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
            ...(typeof persisted.showTreeContent === "boolean" && { showTreeContent: persisted.showTreeContent }),
            ...(typeof persisted.condensedTimelineEnabled === "boolean" && {
              condensedTimelineEnabled: persisted.condensedTimelineEnabled,
            }),
            ...(typeof persisted.spanPanelOpen === "boolean" && { spanPanelOpen: persisted.spanPanelOpen }),
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
  isAlwaysSelectSpan,
  initialSignalId,
  initialChatOpen,
}: PropsWithChildren<{
  initialTrace?: TraceViewTrace;
  storeKey?: string;
  isAlwaysSelectSpan?: boolean;
  initialSignalId?: string;
  initialChatOpen?: boolean;
}>) => {
  const [storeState] = useState(() =>
    createTraceViewStore({
      initialTrace,
      storeKey,
      isAlwaysSelectSpan,
      initialSignalId,
      initialChatOpen,
    })
  );

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

  return useStoreWithEqualityFn(store, selector, equalityFn);
};

export default TraceViewStoreProvider;
