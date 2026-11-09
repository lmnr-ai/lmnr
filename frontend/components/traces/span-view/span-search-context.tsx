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

import { byDomOrder, type SearchableSource } from "@/components/traces/span-view/searchable";

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

export interface SpanSearchRegistrationContextValue {
  registerSource: (source: SearchableSource) => void;
  unregisterSource: (id: string) => void;
}

const SpanSearchStateContext = createContext<SpanSearchStateContextValue | null>(null);
const SpanSearchRegistrationContext = createContext<SpanSearchRegistrationContextValue | null>(null);

export const useSpanSearchState = () => useContext(SpanSearchStateContext);
export const useSpanSearchRegistration = () => useContext(SpanSearchRegistrationContext);

/** Lets a virtualized list collect its mounted editors per row instead of registering each one here. */
export const SpanSearchRegistrationScope = SpanSearchRegistrationContext.Provider;

export function SpanSearchProvider({ children, initialSearchTerm }: PropsWithChildren<{ initialSearchTerm?: string }>) {
  const sources = useRef<Map<string, RegisteredSource>>(new Map());
  const searchTermRef = useRef(initialSearchTerm ?? "");
  const [searchTerm, setSearchTermState] = useState(initialSearchTerm ?? "");
  const [totalMatches, setTotalMatches] = useState(0);
  const [currentGlobalIndex, setCurrentGlobalIndex] = useState(0);
  // A new term jumps to its first match, as soon as one is counted (sources can register after the term is set).
  const jumpPending = useRef(!!initialSearchTerm);
  // The current match by source, not global position: sources re-register (format or tab switches) and shift it.
  const active = useRef<{ id: string; localIndex: number } | null>(null);

  const setSearchTerm = useCallback((term: string) => {
    searchTermRef.current = term;
    jumpPending.current = term.trim().length > 0;
    active.current = null;
    setCurrentGlobalIndex(0);
    setSearchTermState(term);
  }, []);

  const getSortedSources = useCallback(
    (): RegisteredSource[] =>
      Array.from(sources.current.values())
        .filter((e) => e.matchCount > 0)
        .sort((a, b) => byDomOrder(a.source, b.source)),
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

      active.current = { id: entry.source.id, localIndex };
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

  const syncTotals = useCallback(() => {
    let total = 0;
    sources.current.forEach((entry) => {
      total += entry.matchCount;
    });
    setTotalMatches(total);
    // Re-derived from the source holding the current match: sources before it may have registered or changed count.
    let position = 0;
    let found = false;
    for (const entry of getSortedSources()) {
      if (entry.source.id === active.current?.id) {
        found = active.current.localIndex < entry.matchCount;
        position += active.current.localIndex + 1;
        break;
      }
      position += entry.matchCount;
    }
    if (!found) active.current = null;
    setCurrentGlobalIndex(found ? position : 0);
    if (total > 0 && jumpPending.current) {
      jumpPending.current = false;
      goToGlobalMatch(0);
    }
  }, [getSortedSources, goToGlobalMatch]);

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
      // Applying the term clears the source's current match.
      if (active.current?.id === source.id) active.current = null;

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
        if (active.current?.id === id) active.current = null;
        requestAnimationFrame(() => syncTotals());
      }
    },
    [syncTotals]
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
