import { EditorState, type Extension, RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

import { findParameterRefs } from "@/components/sql/parameters";
import { setSignatureTooltip } from "@/components/ui/content-renderer/lang-clickhouse";

/** Opens the parameter's value input; `returnFocus` puts the caret back in the editor afterwards. */
export type RevealParameter = (name: string, returnFocus: () => void) => void;

const parameterMark = Decoration.mark({ class: "cm-sql-parameter" });

const buildDecorations = (view: EditorView): DecorationSet => {
  const builder = new RangeSetBuilder<Decoration>();
  // Whole doc: a string literal opened above the viewport decides whether a brace inside it is code.
  for (const ref of findParameterRefs(view.state.doc.toString())) {
    if (view.visibleRanges.some(({ from, to }) => ref.from < to && ref.to > from)) {
      builder.add(ref.from, ref.to, parameterMark);
    }
  }
  return builder.finish();
};

const parameterDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) this.decorations = buildDecorations(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

const parameterTheme = EditorView.baseTheme({
  ".cm-content .cm-sql-parameter": {
    color: "hsl(var(--primary))",
    background: "hsl(var(--primary) / 0.12)",
    borderRadius: "3px",
    padding: "1px 0",
    boxShadow: "0 0 0 1px hsl(var(--primary) / 0.25)",
    cursor: "pointer",
  },
  ".cm-content .cm-sql-parameter:hover": {
    background: "hsl(var(--primary) / 0.2)",
    boxShadow: "0 0 0 1px hsl(var(--primary) / 0.45)",
  },
});

/** Edge offsets excluded: clicking past the closing brace to park the caret must not open the input. */
const isInsidePlaceholder = (doc: string, pos: number) =>
  findParameterRefs(doc).find((ref) => pos > ref.from && pos < ref.to);

// The enclosing call's signature help would otherwise pop up behind the value input on mousedown.
const suppressSignatureHelpInsidePlaceholder = EditorState.transactionExtender.of((tr) => {
  if (!tr.selection && !tr.docChanged) return null;
  const inside = isInsidePlaceholder(tr.newDoc.toString(), tr.newSelection.main.head);
  return inside ? { effects: setSignatureTooltip.of(null) } : null;
});

/**
 * On `click` rather than `mousedown` so a drag or shift-click through a placeholder has already set
 * a selection, and returning `false` so CodeMirror still places the caret where the click landed.
 */
const revealOnClick = (onReveal: RevealParameter) =>
  EditorView.domEventHandlers({
    click(event, view) {
      if (event.button !== 0 || event.shiftKey || event.altKey) return false;
      if (!view.state.selection.main.empty) return false;

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;

      const ref = isInsidePlaceholder(view.state.doc.toString(), pos);
      if (ref) onReveal(ref.name, () => view.focus());
      return false;
    },
  });

/** Marks `{name:Type}` placeholders as pills and opens a placeholder's value input when it is clicked. */
export const parameterHighlight = (onReveal: RevealParameter): Extension[] => [
  parameterDecorations,
  parameterTheme,
  revealOnClick(onReveal),
  suppressSignatureHelpInsidePlaceholder,
];
