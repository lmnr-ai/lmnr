import { create } from "zustand";

interface NotificationPanelStore {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
}

export const useNotificationPanelStore = create<NotificationPanelStore>()((set) => ({
  isOpen: false,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  close: () => set({ isOpen: false }),
}));
