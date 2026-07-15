import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { type SearchableSource } from "@/components/traces/span-view/searchable";

interface RegisteredSource {
  source: SearchableSource;
  matchCount: number;
}

interface SpanSearchStateContextValue {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  totalMatches: number;
  currentIndex: number;
  goToNext: () => void;
  goToPrev: () => void;
}

interface SpanSearchRegistrationContextValue {
  registerSource: (source: SearchableSource) => void;
  unregisterSource: (id: string) => void;
}

const SpanSearchStateContext = createContext<SpanSearchStateContextValue | null>(null);
const SpanSearchRegistrationContext = createContext<SpanSearchRegistrationContextValue | null>(null);

export const useSpanSearchState = () => useContext(SpanSearchStateContext);
export const useSpanSearchRegistration = () => useContext(SpanSearchRegistrationContext);

export function SpanSearchProvider({ children, initialSearchTerm }: PropsWithChildren<{ initialSearchTerm?: string }>) {
  const sources = useRef<Map<string, RegisteredSource>>(new Map());
  const searchTermRef = useRef(initialSearchTerm ?? "");
  const [searchTerm, setSearchTermState] = useState(initialSearchTerm ?? "");
  const [totalMatches, setTotalMatches] = useState(0);
  const [currentGlobalIndex, setCurrentGlobalIndex] = useState(0);

  const setSearchTerm = useCallback((term: string) => {
    searchTermRef.current = term;
    setCurrentGlobalIndex(0);
    setSearchTermState(term);
  }, []);

  const syncTotals = useCallback(() => {
    let total = 0;
    sources.current.forEach((entry) => {
      total += entry.matchCount;
    });
    setTotalMatches(total);
    setCurrentGlobalIndex((prev) => {
      if (total === 0) return 0;
      return Math.min(prev, total);
    });
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      sources.current.forEach((entry) => {
        entry.matchCount = entry.source.apply(searchTerm);
      });
      syncTotals();
    });

    return () => cancelAnimationFrame(frame);
  }, [searchTerm, syncTotals]);

  const registerSource = useCallback(
    (source: SearchableSource) => {
      const existing = sources.current.get(source.id);
      if (existing && existing.source !== source) {
        existing.source.destroy();
      }

      const matchCount = source.apply(searchTermRef.current);
      sources.current.set(source.id, { source, matchCount });
      requestAnimationFrame(() => syncTotals());
    },
    [syncTotals]
  );

  const unregisterSource = useCallback(
    (id: string) => {
      const entry = sources.current.get(id);
      if (entry) {
        entry.source.destroy();
        sources.current.delete(id);
        requestAnimationFrame(() => syncTotals());
      }
    },
    [syncTotals]
  );

  const getSortedSources = useCallback(
    (): RegisteredSource[] =>
      Array.from(sources.current.values())
        .filter((e) => e.matchCount > 0)
        .sort((a, b) => {
          if (a.source.messageIndex !== b.source.messageIndex) {
            return a.source.messageIndex - b.source.messageIndex;
          }
          return a.source.contentPartIndex - b.source.contentPartIndex;
        }),
    []
  );

  const getSourceForGlobalIndex = useCallback(
    (globalIndex: number): { entry: RegisteredSource; localIndex: number } | null => {
      const sorted = getSortedSources();
      let accumulated = 0;

      for (const entry of sorted) {
        if (globalIndex < accumulated + entry.matchCount) {
          return {
            entry,
            localIndex: globalIndex - accumulated,
          };
        }
        accumulated += entry.matchCount;
      }

      return null;
    },
    [getSortedSources]
  );

  const goToGlobalMatch = useCallback(
    (globalIndex: number) => {
      const result = getSourceForGlobalIndex(globalIndex);
      if (!result) return;

      const { entry, localIndex } = result;

      setCurrentGlobalIndex(globalIndex + 1);

      sources.current.forEach((other) => {
        if (other.source.id !== entry.source.id) {
          other.source.clearActive();
        }
      });

      entry.source.goTo(localIndex);
    },
    [getSourceForGlobalIndex]
  );

  const goToNext = useCallback(() => {
    if (totalMatches === 0) return;
    const nextIndex = currentGlobalIndex >= totalMatches ? 0 : currentGlobalIndex;
    goToGlobalMatch(nextIndex);
  }, [totalMatches, currentGlobalIndex, goToGlobalMatch]);

  const goToPrev = useCallback(() => {
    if (totalMatches === 0) return;
    const prevIndex = currentGlobalIndex <= 1 ? totalMatches - 1 : currentGlobalIndex - 2;
    goToGlobalMatch(prevIndex);
  }, [totalMatches, currentGlobalIndex, goToGlobalMatch]);

  const stateValue = useMemo(
    () => ({
      searchTerm,
      setSearchTerm,
      totalMatches,
      currentIndex: currentGlobalIndex,
      goToNext,
      goToPrev,
    }),
    [searchTerm, setSearchTerm, totalMatches, currentGlobalIndex, goToNext, goToPrev]
  );

  const registrationValue = useMemo(
    () => ({
      registerSource,
      unregisterSource,
    }),
    [registerSource, unregisterSource]
  );

  useEffect(
    () => () => {
      sources.current.forEach((entry) => entry.source.destroy());
      sources.current.clear();
    },
    []
  );

  return (
    <SpanSearchStateContext.Provider value={stateValue}>
      <SpanSearchRegistrationContext.Provider value={registrationValue}>
        {children}
      </SpanSearchRegistrationContext.Provider>
    </SpanSearchStateContext.Provider>
  );
}
