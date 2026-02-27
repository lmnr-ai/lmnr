import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, type EditorView, ViewPlugin } from "@codemirror/view";

import { clickhouseFunctionNamesSet } from "./function-signatures";

const functionDecoration = Decoration.mark({ class: "cm-sql-function" });
const knownIdentifierDecoration = Decoration.mark({ class: "cm-sql-known-identifier" });
const unknownIdentifierDecoration = Decoration.mark({ class: "cm-sql-unknown-identifier" });

export function createIdentifierHighlighter(knownIdentifiers: Set<string>) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: { view: EditorView; docChanged: boolean; viewportChanged: boolean }) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        const doc = view.state.doc;
        const tree = syntaxTree(view.state);
        const { from, to } = view.viewport;
        const ranges: Array<{ from: number; to: number; decoration: Decoration }> = [];

        tree.iterate({
          from,
          to,
          enter: (node) => {
            if (node.name === "Identifier" || node.name === "VariableName" || node.name === "Name") {
              const text = doc.sliceString(node.from, node.to);
              const lowerText = text.toLowerCase();
              const nextChar = doc.sliceString(node.to, node.to + 1);

              let decoration: Decoration;

              if (nextChar === "(" && clickhouseFunctionNamesSet.has(lowerText)) {
                decoration = functionDecoration;
              } else if (knownIdentifiers.has(lowerText)) {
                decoration = knownIdentifierDecoration;
              } else {
                decoration = unknownIdentifierDecoration;
              }

              ranges.push({ from: node.from, to: node.to, decoration });
            }
          },
        });

        ranges.sort((a, b) => a.from - b.from);
        for (const { from, to, decoration } of ranges) {
          builder.add(from, to, decoration);
        }

        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
}
