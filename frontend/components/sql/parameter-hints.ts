import { EditorState, type Extension, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

import { findParameterRefs, isParameterUnset, type ParameterRef, type SQLParameter } from "@/components/sql/parameters";
import { setSignatureTooltip } from "@/components/ui/content-renderer/lang-clickhouse";

export interface ParameterHints {
  parameters: SQLParameter[];
  conflicts: Record<string, string[]>;
  /** Opens the parameter's value input; `returnFocus` puts the caret back afterwards. Absent in read-only editors. */
  onReveal?: (name: string, returnFocus: () => void) => void;
}

export const setParameterHints = StateEffect.define<ParameterHints>();

/**
 * A field, not an extension-array entry: values change per keystroke in a parameter input, and
 * reconfiguring would rebuild the SQL and autocomplete extensions too. `null` means "not yet sent"
 * (the editor mounts a frame early) and must stay distinct from "no parameters", which paints unset.
 */
const parameterHintsField = StateField.define<ParameterHints | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setParameterHints)) return effect.value;
    }
    return value;
  },
});

const boundMark = Decoration.mark({ class: "cm-sql-parameter" });
const unsetMark = Decoration.mark({ class: "cm-sql-parameter cm-sql-parameter-unset" });

const lookup = (hints: ParameterHints | null, name: string) => hints?.parameters.find((p) => p.name === name);

const buildDecorations = (view: EditorView): DecorationSet => {
  const hints = view.state.field(parameterHintsField);
  const builder = new RangeSetBuilder<Decoration>();
  // Whole doc: a string literal opened above the viewport decides whether a brace inside it is code.
  const refs = findParameterRefs(view.state.doc.toString());
  // Straddling two visible ranges must still add once, in document order.
  const visible = refs.filter((ref) => view.visibleRanges.some(({ from, to }) => ref.from < to && ref.to > from));
  const cursor = view.state.selection.main.head;

  for (const ref of visible) {
    const parameter = lookup(hints, ref.name);
    // Every placeholder is unset while being typed; warning on the one under the cursor would strobe.
    const beingTyped = cursor >= ref.from && cursor <= ref.to;
    const unset = hints !== null && !beingTyped && (!parameter || isParameterUnset(parameter));
    builder.add(ref.from, ref.to, unset ? unsetMark : boundMark);
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
      const hintsChanged = update.state.field(parameterHintsField) !== update.startState.field(parameterHintsField);
      if (update.docChanged || update.viewportChanged || update.selectionSet || hintsChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

/** Edge offsets excluded: clicking past the closing brace to park the caret must not open the input. */
const refAt = (view: EditorView, pos: number): ParameterRef | null =>
  findParameterRefs(view.state.doc.toString()).find((ref) => pos > ref.from && pos < ref.to) ?? null;

/**
 * A placeholder is a bound value, not an argument being authored, so the enclosing call's signature
 * help is noise there — and it otherwise pops up behind the value input for the whole mousedown.
 * Appending the effect beats dismissing it afterwards: the signature field checks effects before it
 * recomputes from the caret, and the caret is set on mousedown, one transaction ahead of any click.
 */
const suppressSignatureHelpInsidePlaceholder = EditorState.transactionExtender.of((tr) => {
  if (!tr.selection && !tr.docChanged) return null;
  const pos = tr.newSelection.main.head;
  const inside = findParameterRefs(tr.newDoc.toString()).some((ref) => pos > ref.from && pos < ref.to);
  return inside ? { effects: setSignatureTooltip.of(null) } : null;
});

/**
 * Returns `false` so CodeMirror still places the caret — that is what makes hijacking click
 * acceptable, since Escape then leaves you positioned to edit the placeholder's text. On `click`
 * rather than `mousedown` so a drag or shift-click through a placeholder has already set a selection.
 */
const revealOnClick = EditorView.domEventHandlers({
  click(event, view) {
    if (event.button !== 0 || event.shiftKey || event.altKey) return false;
    if (!view.state.selection.main.empty) return false;

    const onReveal = view.state.field(parameterHintsField)?.onReveal;
    if (!onReveal) return false;

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return false;

    const ref = refAt(view, pos);
    if (!ref) return false;

    onReveal(ref.name, () => view.focus());
    return false;
  },
});

export const parameterHints: Extension = [
  parameterHintsField,
  parameterDecorations,
  revealOnClick,
  suppressSignatureHelpInsidePlaceholder,
];
