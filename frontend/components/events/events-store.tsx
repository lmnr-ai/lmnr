"use client";
import { createContext, PropsWithChildren, useContext, useRef } from "react";
import { createStore, useStore } from "zustand";

import { EventRow } from "@/lib/events/types";
import { PaginatedResponse } from "@/lib/types";

export type EventsState = {
  projectId: string;
  events?: EventRow[];
  eventNames?: { name: string; count: number; lastEventTimestamp: string }[];
  totalCount: number;
  isLoadingEvents: boolean;
  isLoadingEventNames: boolean;
};

export type EventsActions = {
  fetchEvents: (params: URLSearchParams) => Promise<void>;
  fetchEventNames: () => Promise<void>;
};

export interface EventsProps {
  projectId: string;
}

export type EventsStore = EventsState & EventsActions;

export type EventsStoreApi = ReturnType<typeof createEventsStore>;

export const createEventsStore = (initProps: EventsProps) =>
  createStore<EventsStore>()((set, get) => ({
    projectId: initProps.projectId,
    totalCount: 0,
    isLoadingEvents: false,
    isLoadingEventNames: false,
    fetchEvents: async (params: URLSearchParams) => {
      const { projectId } = get();
      set({ isLoadingEvents: true });

      try {
        const response = await fetch(`/api/projects/${projectId}/events?${params.toString()}`);
        if (!response.ok) throw new Error("Failed to fetch events");

        const data: PaginatedResponse<EventRow> = await response.json();
        set({
          events: data.items,
          totalCount: data.totalCount,
          isLoadingEvents: false,
        });
      } catch (error) {
        console.error("Error fetching events:", error);
        set({ isLoadingEvents: false });
      }
    },

    fetchEventNames: async () => {
      const { projectId } = get();
      set({ isLoadingEventNames: true });

      try {
        const response = await fetch(`/api/projects/${projectId}/events/names`);
        if (!response.ok) throw new Error("Failed to fetch event names");

        const data = await response.json();
        set({
          eventNames: data,
          isLoadingEventNames: false,
        });
      } catch (error) {
        console.error("Error fetching event names:", error);
        set({ isLoadingEventNames: false });
      }
    },
  }));

export const EventsContext = createContext<EventsStoreApi | null>(null);

export const useEventsStoreContext = <T,>(selector: (state: EventsStore) => T): T => {
  const store = useContext(EventsContext);
  if (!store) throw new Error("Missing EventsContext.Provider in the tree");
  return useStore(store, selector);
};

export const EventsStoreProvider = ({ children, ...props }: PropsWithChildren<EventsProps>) => {
  const storeRef = useRef<EventsStoreApi | undefined>(undefined);
  if (!storeRef.current) {
    storeRef.current = createEventsStore(props);
  }

  return <EventsContext.Provider value={storeRef.current}>{children}</EventsContext.Provider>;
};
