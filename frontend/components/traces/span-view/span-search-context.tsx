import { closeSearchPanel, findNext, openSearchPanel, SearchQuery, setSearchQuery } from "@codemirror/search";
import { type EditorView } from "@codemirror/view";
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

interface EditorInstance {
  id: string;
  view: EditorView;
  messageIndex: number;
  contentPartIndex: number;
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
  registerEditor: (id: string, view: EditorView, messageIndex: number, contentPartIndex: number) => void;
  unregisterEditor: (id: string) => void;
}

const SpanSearchStateContext = createContext<SpanSearchStateContextValue | null>(null);
const SpanSearchRegistrationContext = createContext<SpanSearchRegistrationContextValue | null>(null);

export const useSpanSearchState = () => useContext(SpanSearchStateContext);
export const useSpanSearchRegistration = () => useContext(SpanSearchRegistrationContext);

function buildSearchRegex(query: string): RegExp | null {
  const tokens = query
    .split(/[^a-zA-Z0-9]+/)
    .filter((t) => t.length > 0)
    .map((t) => t.replace(/[\\.*+?^${}()|[\]]/g, "\\$&"));

  if (tokens.length === 0) {
    return null;
  }

  const core = tokens.length === 1 ? tokens[0] : tokens.join("[^a-zA-Z0-9]+");

  return new RegExp(core, "i");
}

function applySearchAndCount(view: EditorView, searchTerm: string): number {
  const trimmed = searchTerm.trim();
  if (!trimmed) {
    closeSearchPanel(view);
    view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ search: "" })),
    });
    return 0;
  }

  const regex = buildSearchRegex(trimmed);
  if (!regex) {
    closeSearchPanel(view);
    view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ search: "" })),
    });
    return 0;
  }

  const docText = view.state.doc.toString();

  openSearchPanel(view);
  view.dispatch({
    effects: setSearchQuery.of(
      new SearchQuery({
        search: regex.source,
        caseSensitive: false,
        literal: false,
        wholeWord: false,
        regexp: true,
      })
    ),
  });

  const globalRegex = new RegExp(regex.source, "gi");
  const matches = docText.match(globalRegex);
  return matches ? matches.length : 0;
}

function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
  let current = el.parentElement;
  while (current) {
    const { overflowY } = getComputedStyle(current);
    if (overflowY === "auto" || overflowY === "scroll") return current;
    current = current.parentElement;
  }
  return null;
}

function scrollEditorMatchToCenter(view: EditorView) {
  const coords = view.coordsAtPos(view.state.selection.main.head);
  if (!coords) return;

  const scrollParent = findScrollableAncestor(view.dom);
  if (!scrollParent) return;

  const parentRect = scrollParent.getBoundingClientRect();
  const matchY = coords.top - parentRect.top + scrollParent.scrollTop;
  const targetScroll = matchY - parentRect.height / 2;

  scrollParent.scrollTo({ top: targetScroll, behavior: "smooth" });
}

function navigateToMatch(view: EditorView, searchTerm: string, localIndex: number) {
  const regex = buildSearchRegex(searchTerm);
  if (!regex) return;

  view.dispatch({
    selection: { anchor: 0, head: 0 },
    scrollIntoView: false,
  });

  closeSearchPanel(view);
  openSearchPanel(view);

  view.dispatch({
    effects: setSearchQuery.of(
      new SearchQuery({
        search: regex.source,
        caseSensitive: false,
        literal: false,
        wholeWord: false,
        regexp: true,
      })
    ),
  });

  requestAnimationFrame(() => {
    for (let i = 0; i <= localIndex; i++) {
      findNext(view);
    }
    requestAnimationFrame(() => {
      scrollEditorMatchToCenter(view);
    });
  });
}

export function SpanSearchProvider({ children, initialSearchTerm }: PropsWithChildren<{ initialSearchTerm?: string }>) {
  const editors = useRef<Map<string, EditorInstance>>(new Map());
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
    editors.current.forEach((editor) => {
      total += editor.matchCount;
    });
    setTotalMatches(total);
    setCurrentGlobalIndex((prev) => {
      if (total === 0) return 0;
      return Math.min(prev, total);
    });
  }, []);

  // Apply search + count in a single pass per editor when searchTerm changes
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      editors.current.forEach((editor) => {
        editor.matchCount = applySearchAndCount(editor.view, searchTerm);
      });
      syncTotals();
    });

    return () => cancelAnimationFrame(frame);
  }, [searchTerm, syncTotals]);

  const registerEditor = useCallback(
    (id: string, view: EditorView, messageIndex: number, contentPartIndex: number) => {
      const term = searchTermRef.current;
      const matchCount = term ? applySearchAndCount(view, term) : 0;
      editors.current.set(id, { id, view, messageIndex, contentPartIndex, matchCount });
      if (term) {
        requestAnimationFrame(() => syncTotals());
      }
    },
    [syncTotals]
  );

  const unregisterEditor = useCallback(
    (id: string) => {
      editors.current.delete(id);
      requestAnimationFrame(() => syncTotals());
    },
    [syncTotals]
  );

  const getSortedEditors = useCallback(
    (): EditorInstance[] =>
      Array.from(editors.current.values())
        .filter((e) => e.matchCount > 0)
        .sort((a, b) => {
          if (a.messageIndex !== b.messageIndex) return a.messageIndex - b.messageIndex;
          return a.contentPartIndex - b.contentPartIndex;
        }),
    []
  );

  const getEditorForGlobalIndex = useCallback(
    (globalIndex: number): { editor: EditorInstance; localIndex: number } | null => {
      const sortedEditors = getSortedEditors();
      let accumulated = 0;

      for (const editor of sortedEditors) {
        if (globalIndex < accumulated + editor.matchCount) {
          return {
            editor,
            localIndex: globalIndex - accumulated,
          };
        }
        accumulated += editor.matchCount;
      }

      return null;
    },
    [getSortedEditors]
  );

  const goToGlobalMatch = useCallback(
    (globalIndex: number) => {
      const result = getEditorForGlobalIndex(globalIndex);
      if (!result) return;

      const { editor, localIndex } = result;

      setCurrentGlobalIndex(globalIndex + 1);

      editors.current.forEach((ed) => {
        if (ed.id !== editor.id) {
          ed.view.dispatch({
            selection: { anchor: 0, head: 0 },
          });
        }
      });

      navigateToMatch(editor.view, searchTermRef.current.trim(), localIndex);
    },
    [getEditorForGlobalIndex]
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
      registerEditor,
      unregisterEditor,
    }),
    [registerEditor, unregisterEditor]
  );

  useEffect(
    () => () => {
      editors.current.clear();
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
