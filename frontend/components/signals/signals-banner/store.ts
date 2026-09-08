import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SignalsBannerStore {
  isBannerDismissed: boolean;
  dismiss: () => void;
  toggle: () => void;
}

export const useSignalsBannerStore = create<SignalsBannerStore>()(
  persist(
    (set) => ({
      isBannerDismissed: false,
      dismiss: () => set({ isBannerDismissed: true }),
      toggle: () => set((state) => ({ isBannerDismissed: !state.isBannerDismissed })),
    }),
    { name: "signals-banner" }
  )
);

export function useSignalsBannerHydrated() {
  return useSyncExternalStore(
    useSignalsBannerStore.persist.onFinishHydration,
    useSignalsBannerStore.persist.hasHydrated,
    () => false
  );
}
