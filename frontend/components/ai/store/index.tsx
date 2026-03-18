"use client";
import { useEffect } from "react";
import { createStore, type StoreApi, useStore } from "zustand";

import type { AIRegistry, AIStoreKey, AIStoreState } from "@/components/ai/store/types";

export const aiStore = createStore<AIStoreState>((set, get) => ({
  refs: {},

  register: (key, store) => {
    set((s) => ({ refs: { ...s.refs, [key]: store } }));
    return () => {
      set((s) => {
        const { [key]: _, ...refs } = s.refs;
        return { refs };
      });
    };
  },

  //
  // setMockQuery: (query) => {
  //   const mockStore = get().refs.mockStore;
  //
  //   set({ mockQuery: query });
  //   mockStore?.getState().setQuery(query);
  // },
  // mockQuery: "",
}));

export const useAIStore = <T,>(selector: (store: AIStoreState) => T): T => useStore(aiStore, selector);

export const useRegisterAI = <K extends AIStoreKey>(key: K, store: StoreApi<AIRegistry[K]>) => {
  useEffect(() => aiStore.getState().register(key, store), [key, store]);
};

// Example usage
// // Example store being used by global store.
// type MockStore = { query: string; setQuery: (query: string) => void };
// const createMockStore = () =>
//   createStore<MockStore>()((set) => ({
//     query: "",
//     setQuery: (query) => set({ query }),
//   }));
//
// const MockStoreContext = createContext<StoreApi<MockStore> | undefined>(undefined);
//
// export const useMockStore = <T,>(selector: (store: MockStore) => T): T => {
//   const store = useContext(MockStoreContext);
//   if (!store) {
//     throw new Error("useMockStoreContext must be used within a MockStoreContext");
//   }
//
//   return useStore(store, selector);
// };
//
// export const MockStoreProvider = ({ children }: PropsWithChildren) => {
//   const [store] = useState(() => createMockStore());
//
//   useRegisterAI("mockStore", store);
//   return <MockStoreContext.Provider value={store}>{children}</MockStoreContext.Provider>;
// };
