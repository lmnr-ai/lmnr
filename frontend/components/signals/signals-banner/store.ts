import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SignalsBannerStore {
  isBannerDismissed: boolean;
  dismiss: () => void;
  show: () => void;
}

export const useSignalsBannerStore = create<SignalsBannerStore>()(
  persist(
    (set) => ({
      isBannerDismissed: false,
      dismiss: () => set({ isBannerDismissed: true }),
      show: () => set({ isBannerDismissed: false }),
    }),
    { name: "signals-banner" }
  )
);
