import { closeSearchPanel, findNext, openSearchPanel, SearchQuery, setSearchQuery } from "@codemirror/search";
import { type EditorView } from "@codemirror/view";

import { buildSearchRegex, countMatches } from "@/components/traces/span-view/searchable/find-matches";
import { type SearchableSource } from "@/components/traces/span-view/searchable/types";

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

  return countMatches(view.state.doc.toString(), trimmed);
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
  });
}

interface CodeMirrorSearchSourceOptions {
  id: string;
  view: EditorView;
  messageIndex: number;
  contentPartIndex: number;
}

export function createCodeMirrorSearchSource({
  id,
  view,
  messageIndex,
  contentPartIndex,
}: CodeMirrorSearchSourceOptions): SearchableSource {
  let lastTerm = "";

  return {
    id,
    messageIndex,
    contentPartIndex,
    apply(term: string) {
      lastTerm = term;
      return applySearchAndCount(view, term);
    },
    goTo(localIndex: number) {
      navigateToMatch(view, lastTerm.trim(), localIndex);
    },
    clearActive() {
      view.dispatch({
        selection: { anchor: 0, head: 0 },
      });
    },
    destroy() {
      applySearchAndCount(view, "");
    },
  };
}
