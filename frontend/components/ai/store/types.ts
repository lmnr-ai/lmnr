import { type StoreApi } from "zustand";

export interface AIRegistry {
  // registry of other stores it has access to
  mockStore: {
    query: string;
    setQuery: (query: string) => void;
  };
}

export type AIStoreKey = keyof AIRegistry;
export type AIStoreRefs = { [K in AIStoreKey]?: StoreApi<AIRegistry[K]> };

export interface AIStoreState {
  refs: AIStoreRefs;
  register: <K extends AIStoreKey>(key: K, store: StoreApi<AIRegistry[K]>) => () => void;

  // internal ai store actions/states
  // setMockQuery: (query: string) => void;
  // mockQuery: string;
}
