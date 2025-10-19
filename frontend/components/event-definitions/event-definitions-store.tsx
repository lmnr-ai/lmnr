"use client";
import { createContext, PropsWithChildren, useContext, useRef } from "react";
import { createStore, useStore } from "zustand";

import { EventDefinitionRow } from "@/lib/actions/event-definitions";

export type EventDefinitionsState = {
  projectId: string;
  eventDefinitions?: EventDefinitionRow[];
};

export type EventDefinitionsActions = {
  fetchEventDefinitions: () => Promise<void>;
};

export interface EventDefinitionsProps {
  projectId: string;
}

export type EventDefinitionsStore = EventDefinitionsState & EventDefinitionsActions;

export type EventDefinitionsStoreApi = ReturnType<typeof createEventDefinitionsStore>;

export const createEventDefinitionsStore = (initProps: EventDefinitionsProps) =>
  createStore<EventDefinitionsStore>()((set, get) => ({
    projectId: initProps.projectId,
    fetchEventDefinitions: async () => {
      const { projectId } = get();
      set({ eventDefinitions: undefined });
      try {
        const response = await fetch(`/api/projects/${projectId}/event-definitions`);
        if (!response.ok) throw new Error("Failed to fetch event definitions");

        const data = await response.json();
        set({
          eventDefinitions: data,
        });
      } catch (error) {
        set({ eventDefinitions: [] });
        console.error("Error fetching event definitions:", error);
      }
    },
  }));

export const EventDefinitionsContext = createContext<EventDefinitionsStoreApi | null>(null);

export const useEventDefinitionsStoreContext = <T,>(selector: (state: EventDefinitionsStore) => T): T => {
  const store = useContext(EventDefinitionsContext);
  if (!store) throw new Error("Missing EventDefinitionsContext.Provider in the tree");
  return useStore(store, selector);
};

export const EventDefinitionsStoreProvider = ({ children, ...props }: PropsWithChildren<EventDefinitionsProps>) => {
  const storeRef = useRef<EventDefinitionsStoreApi | undefined>(undefined);
  if (!storeRef.current) {
    storeRef.current = createEventDefinitionsStore(props);
  }

  return <EventDefinitionsContext.Provider value={storeRef.current}>{children}</EventDefinitionsContext.Provider>;
};
