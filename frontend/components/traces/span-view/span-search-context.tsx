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

function processSearchTerm(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const hasEscapeSequences = /\\[nrt]/.test(trimmed);
  return hasEscapeSequences ? trimmed.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\r/g, "\r") : trimmed;
}

// Single-pass: applies the CodeMirror search query AND counts matches,
// using one toString() and one toLowerCase() per editor.
function applySearchAndCount(view: EditorView, searchTerm: string): number {
  const processed = processSearchTerm(searchTerm);
  if (!processed) {
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
        search: processed,
        caseSensitive: false,
        literal: true,
        wholeWord: false,
        regexp: false,
      })
    ),
  });

  const lowerDoc = docText.toLowerCase();
  const lowerSearch = processed.toLowerCase();
  let count = 0;
  let pos = 0;
  while ((pos = lowerDoc.indexOf(lowerSearch, pos)) !== -1) {
    count++;
    pos += lowerSearch.length;
  }
  return count;
}

function navigateToMatch(view: EditorView, searchTerm: string, localIndex: number) {
  view.dispatch({
    selection: { anchor: 0, head: 0 },
    scrollIntoView: false,
  });

  closeSearchPanel(view);
  openSearchPanel(view);

  view.dispatch({
    effects: setSearchQuery.of(
      new SearchQuery({
        search: searchTerm,
        caseSensitive: false,
        literal: true,
        wholeWord: false,
        regexp: false,
      })
    ),
  });

  requestAnimationFrame(() => {
    for (let i = 0; i <= localIndex; i++) {
      findNext(view);
    }
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

      navigateToMatch(editor.view, processSearchTerm(searchTermRef.current), localIndex);
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
