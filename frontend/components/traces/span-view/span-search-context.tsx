import { closeSearchPanel, findNext, openSearchPanel, SearchQuery, setSearchQuery } from "@codemirror/search";
import { EditorView } from "@codemirror/view";
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

interface EditorInstance {
  id: string;
  view: EditorView;
  messageIndex: number;
  contentPartIndex: number;
  matchCount: number;
  containerElement: HTMLElement;
}

interface SpanSearchContextValue {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  totalMatches: number;
  currentIndex: number;
  goToNext: () => void;
  goToPrev: () => void;
  registerEditor: (
    id: string,
    view: EditorView,
    messageIndex: number,
    contentPartIndex: number,
    containerElement: HTMLElement
  ) => void;
  unregisterEditor: (id: string) => void;
}

const SpanSearchContext = createContext<SpanSearchContextValue | null>(null);

export const useSpanSearchContext = () => useContext(SpanSearchContext);

function countMatches(text: string, search: string): number {
  if (!search.trim()) return 0;

  const lowerText = text.toLowerCase();
  const lowerSearch = search.toLowerCase();
  let count = 0;
  let pos = 0;

  while ((pos = lowerText.indexOf(lowerSearch, pos)) !== -1) {
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

export function SpanSearchProvider({ children }: PropsWithChildren) {
  const editors = useRef<Map<string, EditorInstance>>(new Map());
  const updateTimerRef = useRef<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [totalMatches, setTotalMatches] = useState(0);
  const [currentGlobalIndex, setCurrentGlobalIndex] = useState(0);

  const updateTotalMatches = useCallback(() => {
    let total = 0;
    editors.current.forEach((editor) => {
      const doc = editor.view.state.doc.toString();
      const count = countMatches(doc, searchTerm);
      editor.matchCount = count;
      total += count;
    });
    setTotalMatches(total);
  }, [searchTerm]);

  const scheduleUpdate = useCallback(() => {
    if (updateTimerRef.current !== null) {
      cancelAnimationFrame(updateTimerRef.current);
    }
    updateTimerRef.current = requestAnimationFrame(() => {
      updateTotalMatches();
      updateTimerRef.current = null;
    });
  }, [updateTotalMatches]);

  const registerEditor = useCallback(
    (id: string, view: EditorView, messageIndex: number, contentPartIndex: number, containerElement: HTMLElement) => {
      editors.current.set(id, {
        id,
        view,
        messageIndex,
        contentPartIndex,
        matchCount: 0,
        containerElement,
      });
      if (searchTerm) {
        scheduleUpdate();
      }
    },
    [searchTerm, scheduleUpdate]
  );

  const unregisterEditor = useCallback(
    (id: string) => {
      editors.current.delete(id);
      scheduleUpdate();
    },
    [scheduleUpdate]
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

      editor.containerElement.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          navigateToMatch(editor.view, searchTerm, localIndex);
        });
      });
    },
    [getEditorForGlobalIndex, searchTerm]
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

  useEffect(() => {
    if (updateTimerRef.current !== null) {
      cancelAnimationFrame(updateTimerRef.current);
    }
    updateTimerRef.current = requestAnimationFrame(() => {
      updateTotalMatches();
      updateTimerRef.current = null;
    });

    return () => {
      if (updateTimerRef.current !== null) {
        cancelAnimationFrame(updateTimerRef.current);
        updateTimerRef.current = null;
      }
    };
  }, [searchTerm, updateTotalMatches]);

  useEffect(() => {
    if (totalMatches > 0 && currentGlobalIndex === 0) {
      setCurrentGlobalIndex(1);
    } else if (totalMatches === 0) {
      setCurrentGlobalIndex(0);
    }
  }, [totalMatches, currentGlobalIndex]);

  const value = useMemo(
    () => ({
      searchTerm,
      setSearchTerm,
      totalMatches,
      currentIndex: currentGlobalIndex,
      goToNext,
      goToPrev,
      registerEditor,
      unregisterEditor,
    }),
    [searchTerm, totalMatches, currentGlobalIndex, goToNext, goToPrev, registerEditor, unregisterEditor]
  );

  useEffect(
    () => () => {
      if (updateTimerRef.current !== null) {
        cancelAnimationFrame(updateTimerRef.current);
      }
      editors.current.clear();
    },
    []
  );

  return <SpanSearchContext.Provider value={value}>{children}</SpanSearchContext.Provider>;
}
