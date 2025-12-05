import { Extension } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";

function findMustacheTags(text: string) {
  const tags: Array<{ from: number; to: number; type: string }> = [];
  const regex = /\{\{([#/^>!&]?)([^}]*?)\}\}/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const fullMatch = match[0];
    const keyword = match[1];
    const content = match[2];

    const start = match.index;
    const end = start + fullMatch.length;

    tags.push({ from: start, to: start + 2, type: "bracket" });

    if (keyword) {
      tags.push({ from: start + 2, to: start + 2 + keyword.length, type: "keyword" });
      if (content.trim()) {
        tags.push({
          from: start + 2 + keyword.length,
          to: end - 2,
          type: "variable"
        });
      }
    } else {
      if (content.trim()) {
        tags.push({ from: start + 2, to: end - 2, type: "variable" });
      }
    }

    tags.push({ from: end - 2, to: end, type: "bracket" });
  }

  return tags;
}

const mustachePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView) {
      const decorations = [];
      const text = view.state.doc.toString();
      const tags = findMustacheTags(text);

      for (const tag of tags) {
        const className = `cm-mustache-${tag.type}`;
        decorations.push(
          Decoration.mark({ class: className }).range(tag.from, tag.to)
        );
      }

      return Decoration.set(decorations, true);
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

export const mustache: Extension = [mustachePlugin];
