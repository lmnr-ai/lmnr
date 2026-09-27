import { create } from "zustand";

import { MOCK_FEATURE_BANNERS } from "@/lib/feature-banners/mock";
import { type FeatureBanner, isBannerActive } from "@/lib/feature-banners/types";

// Acknowledgments are in-memory only (reset on reload) until we decide where to persist them.
interface FeatureBannerStore {
  banners: FeatureBanner[];
  acknowledgedIds: string[];
  // Kept after close so the dialog can keep rendering through its exit animation.
  detailsBannerId: string | null;
  detailsOpen: boolean;
  acknowledge: (id: string) => void;
  openDetails: (id: string) => void;
  closeDetails: () => void;
  reset: () => void;
}

export const useFeatureBannerStore = create<FeatureBannerStore>()((set) => ({
  banners: MOCK_FEATURE_BANNERS,
  acknowledgedIds: [],
  detailsBannerId: null,
  detailsOpen: false,
  acknowledge: (id) =>
    set((state) => ({
      acknowledgedIds: state.acknowledgedIds.includes(id) ? state.acknowledgedIds : [...state.acknowledgedIds, id],
    })),
  openDetails: (id) => set({ detailsBannerId: id, detailsOpen: true }),
  closeDetails: () => set({ detailsOpen: false }),
  reset: () => set({ acknowledgedIds: [], detailsOpen: false }),
}));

// Newest first; expired and acknowledged banners are dropped.
export const selectVisibleBanners = (state: FeatureBannerStore) =>
  state.banners
    .filter((b) => isBannerActive(b) && !state.acknowledgedIds.includes(b.id))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
