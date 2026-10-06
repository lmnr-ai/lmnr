import { create } from "zustand";

import { type Announcement } from "@/lib/announcements/types";

interface AnnouncementsStore {
  /**
   * Dismissals made in this browser session, unioned with the server-rendered
   * list at render time. Module-level rather than component state because the
   * sidebar card unmounts on every sidebar collapse (and with the mobile
   * sheet), while the server list only refreshes on a full layout render — a
   * collapse/expand round trip would otherwise resurrect a dismissed card.
   */
  dismissedIds: ReadonlySet<string>;
  detailsAnnouncement: Announcement | null;
  dismiss: (id: string) => void;
  undoDismiss: (id: string) => void;
  setDetailsAnnouncement: (announcement: Announcement | null) => void;
}

export const useAnnouncementsStore = create<AnnouncementsStore>((set) => ({
  dismissedIds: new Set<string>(),
  detailsAnnouncement: null,
  dismiss: (id) => set((state) => ({ dismissedIds: new Set(state.dismissedIds).add(id) })),
  undoDismiss: (id) =>
    set((state) => {
      const dismissedIds = new Set(state.dismissedIds);
      dismissedIds.delete(id);
      return { dismissedIds };
    }),
  setDetailsAnnouncement: (announcement) => set({ detailsAnnouncement: announcement }),
}));
