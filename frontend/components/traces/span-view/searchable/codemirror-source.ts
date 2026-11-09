import { type Extension, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

import {
  findMatchOffsets,
  type MatchOffset,
  searchPattern,
} from "@/components/traces/span-view/searchable/find-matches";
import { type SearchableSource } from "@/components/traces/span-view/searchable/types";

interface Highlight {
  matches: MatchOffset[];
  active: number;
}

const setHighlight = StateEffect.define<Highlight>();

// Class names styled in content-renderer `baseExtensions`.
const MATCH = Decoration.mark({ class: "cm-searchMatch" });
const ACTIVE = Decoration.mark({ class: "cm-searchMatch cm-searchMatch-selected" });

// Clears the sticky band over the list's top and a card's "Show less" bar at its bottom.
const SCROLL_MARGIN = 96;

const decorate = ({ matches, active }: Highlight): DecorationSet => {
  const builder = new RangeSetBuilder<Decoration>();
  matches.forEach((match, i) => builder.add(match.start, match.end, i === active ? ACTIVE : MATCH));
  return builder.finish();
};

/**
 * Span-search match marks, set by the source below. Its own field instead of `@codemirror/search`: that one only
 * highlights with its panel open and moves between matches one `findNext` at a time.
 */
export const searchHighlight: Extension = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    for (const effect of tr.effects) if (effect.is(setHighlight)) return decorate(effect.value);
    return decorations.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

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
  let matches: MatchOffset[] = [];
  let active = -1;
  let painted = false;

  const paint = (scrollTo?: MatchOffset) => {
    // Most editors never match: skip the transaction while there is nothing to draw or clear.
    if (!painted && matches.length === 0) return;
    painted = matches.length > 0;
    view.dispatch({
      effects: [
        setHighlight.of({ matches, active }),
        ...(scrollTo ? [EditorView.scrollIntoView(scrollTo.start, { y: "nearest", yMargin: SCROLL_MARGIN })] : []),
      ],
    });
  };

  return {
    id,
    messageIndex,
    contentPartIndex,
    element: view.dom,
    apply(term: string) {
      const pattern = searchPattern(term);
      matches = pattern ? findMatchOffsets(view.state.doc.toString(), pattern) : [];
      active = -1;
      paint();
      return matches.length;
    },
    goTo(localIndex: number, scroll = true) {
      const match = matches[localIndex];
      if (!match) return;
      active = localIndex;
      paint(scroll ? match : undefined);
    },
    clearActive() {
      if (active === -1) return;
      active = -1;
      paint();
    },
    destroy() {
      matches = [];
      active = -1;
      paint();
    },
  };
}
