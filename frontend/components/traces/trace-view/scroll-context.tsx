"use client";

import React, {
  createContext,
  type PropsWithChildren,
  type UIEvent,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

interface State {
  totalHeight: number;
  viewportHeight: number;
  scrollTop: number;
}

interface ContextValue {
  state: State;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  visibleSpanIds: string[];
  scrollTo: (pos: number) => void;
  updateState: (newState: Partial<State>) => void;
  setVisibleSpanIds: (spanIds: string[]) => void;
  createScrollHandler: (
    source: "tree" | "minimap",
    syncFn: (scrollData: { scrollTop: number; scrollHeight: number; clientHeight: number }) => void
  ) => (e: UIEvent<HTMLDivElement>) => void;
}

const ScrollContext = createContext<ContextValue | null>(null);

export function useScrollContext() {
  const ctx = useContext(ScrollContext);
  if (!ctx) throw new Error("useScrollContext must be used within provider");
  return ctx;
}

const DEBOUNCED_DELAY = 100;

export function ScrollContextProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<State>({ totalHeight: 0, scrollTop: 0, viewportHeight: 0 });
  const [visibleSpanIds, setVisibleSpanIds] = useState<string[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeScrollerRef = useRef<"tree" | "minimap" | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const scrollTo = useCallback((pos: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = pos;
    }
  }, []);

  const updateState = useCallback((newState: Partial<State>) => {
    setState((prev: State) => ({ ...prev, ...newState }));
  }, []);

  const createScrollHandler = useCallback(
    (
      source: "tree" | "minimap",
      syncFn: (scrollData: { scrollTop: number; scrollHeight: number; clientHeight: number }) => void
    ) =>
      (e: UIEvent<HTMLDivElement>) => {
        if (activeScrollerRef.current !== null && activeScrollerRef.current !== source) {
          return;
        }

        activeScrollerRef.current = source;

        clearTimeout(timeoutRef.current);

        timeoutRef.current = setTimeout(() => {
          activeScrollerRef.current = null;
        }, DEBOUNCED_DELAY);

        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;

        syncFn({ scrollTop, scrollHeight, clientHeight });
      },
    []
  );

  return (
    <ScrollContext.Provider
      value={{
        state,
        scrollRef,
        visibleSpanIds,
        scrollTo,
        updateState,
        setVisibleSpanIds,
        createScrollHandler,
      }}
    >
      {children}
    </ScrollContext.Provider>
  );
}
