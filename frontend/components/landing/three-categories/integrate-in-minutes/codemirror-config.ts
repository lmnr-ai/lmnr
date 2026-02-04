import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { createTheme } from "@uiw/codemirror-themes";

// Line highlighting decoration
const lineHighlightDecoration = Decoration.line({ class: "cm-highlighted-line" });

export const createLineHighlightPlugin = (highlightedLines: number[]) =>
  ViewPlugin.fromClass(
    class {
      decorations;
      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }
      buildDecorations(view: EditorView) {
        const builder = new RangeSetBuilder<Decoration>();
        for (const lineNum of highlightedLines) {
          if (lineNum < view.state.doc.lines) {
            const line = view.state.doc.line(lineNum + 1); // 1-indexed in CodeMirror
            builder.add(line.from, line.from, lineHighlightDecoration);
          }
        }
        return builder.finish();
      }
    },
    { decorations: (v) => v.decorations }
  );

// Ayu-inspired dark theme with landing colors
export const darkTheme = createTheme({
  theme: "dark",
  settings: {
    background: "rgb(22 22 23)", // landing-surface-700
    foreground: "#bfbdb6",
    caret: "rgb(208 117 78)", // landing-primary-400
    selection: "#273747",
    selectionMatch: "#273747",
    lineHighlight: "rgb(37 37 38)", // landing-surface-500
    gutterBackground: "rgb(22 22 23)", // landing-surface-700
    gutterForeground: "rgb(67 68 71)", // landing-text-600
    gutterBorder: "transparent",
  },
  styles: [
    { tag: t.comment, color: "#7C7E85", fontStyle: "italic" },
    { tag: t.string, color: "#a5c089" },
    { tag: [t.keyword, t.operatorKeyword, t.modifier], color: "rgb(208 117 78)" },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#c4b595" },
    { tag: [t.className, t.typeName, t.namespace], color: "#94b4c9" },
    { tag: [t.variableName, t.definition(t.variableName)], color: "#bfbdb6" },
    { tag: [t.propertyName, t.attributeName], color: "#c4b595" },
    { tag: t.number, color: "#c0adc9" },
    { tag: [t.bool, t.null, t.atom], color: "rgb(208 117 78)" },
    { tag: [t.operator, t.punctuation], color: "#b0a5a0" },
    { tag: [t.moduleKeyword, t.controlKeyword], color: "rgb(208 117 78)" },
    { tag: [t.special(t.variableName), t.self, t.constant(t.variableName)], color: "#b0a5a0" },
    { tag: t.angleBracket, color: "#bfbdb6" },
    { tag: t.tagName, color: "#94b4c9" },
  ],
});

export const baseExtensions = [
  EditorView.editable.of(false),
  EditorView.lineWrapping,
  EditorView.theme({
    "&": {
      height: "100%",
      overflow: "hidden",
    },
    ".cm-scroller": {
      overflow: "auto",
      height: "100%",
      maxHeight: "100%",
    },
    ".cm-content": {
      padding: "12px 0",
    },
    ".cm-line": {
      paddingLeft: "16px",
      paddingRight: "16px",
    },
    ".cm-highlighted-line": {
      backgroundColor: "var(--color-landing-primary-400-10)",
      borderLeft: "2px solid rgb(208 117 78)",
    },
  }),
];
