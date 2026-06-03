"use client";
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { yaml } from "@codemirror/lang-yaml";
import { highlightSelectionMatches, search } from "@codemirror/search";
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { createTheme, type CreateThemeOptions } from "@uiw/codemirror-themes";
import YAML from "yaml";

import { inferImageType } from "@/lib/utils";

export const defaultThemeSettings: CreateThemeOptions["settings"] = {
  background: "transparent",
  lineHighlight: "transparent",
  gutterBackground: "#18181A",
  gutterBorder: "transparent",
  gutterForeground: "gray !important",
  selection: "#193860",
  selectionMatch: "transparent",
  caret: "2px solid hsl(var(--primary) / 0.1)",
};

export const githubDarkSyntaxHighlighter = {
  'code[class*="language-"]': {
    color: "#c9d1d9",
    background: "transparent",
  },
  'pre[class*="language-"]': {
    color: "#c9d1d9",
    background: "transparent",
  },
  comment: { color: "#8b949e" },
  prolog: { color: "#8b949e" },
  doctype: { color: "#8b949e" },
  cdata: { color: "#8b949e" },
  punctuation: { color: "#8b949e" },
  property: { color: "#d2a8ff" },
  tag: { color: "#7ee787" },
  boolean: { color: "#ffab70" },
  number: { color: "#79c0ff" },
  constant: { color: "#ffab70" },
  symbol: { color: "#ffab70" },
  deleted: { color: "#ffdcd7" },
  selector: { color: "#7ee787" },
  "attr-name": { color: "#79c0ff" },
  string: { color: "#a5d6ff" },
  char: { color: "#a5d6ff" },
  builtin: { color: "#a5d6ff" },
  inserted: { color: "#7ee787" },
  operator: { color: "#79c0ff" },
  entity: { color: "#79c0ff" },
  url: { color: "#79c0ff" },
  variable: { color: "#79c0ff" },
  atrule: { color: "#ff7b72" },
  "attr-value": { color: "#a5d6ff" },
  keyword: { color: "#ff7b72" },
  function: { color: "#d2a8ff" },
  "class-name": { color: "#d2a8ff" },
  regex: { color: "#a5d6ff" },
  important: { color: "#ff7b72", fontWeight: "bold" },
};

export const githubDarkStyle: CreateThemeOptions["styles"] = [
  { tag: [t.standard(t.tagName), t.tagName], color: "#7ee787" },
  { tag: [t.comment, t.bracket], color: "#8b949e" },
  { tag: [t.className, t.propertyName], color: "#d2a8ff" },
  { tag: [t.variableName, t.attributeName, t.number, t.operator], color: "#79c0ff" },
  { tag: [t.keyword, t.typeName, t.typeOperator, t.typeName], color: "#ff7b72" },
  { tag: [t.string, t.meta, t.regexp], color: "#a5d6ff" },
  { tag: [t.name, t.quote], color: "#c9d1d9" },
  { tag: [t.heading, t.strong], color: "#d2a8ff", fontWeight: "bold" },
  { tag: [t.emphasis], color: "#d2a8ff", fontStyle: "italic" },
  { tag: [t.deleted], color: "#ffdcd7", backgroundColor: "#ffeef0" },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: "#ffab70" },
  { tag: t.link, textDecoration: "underline" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.invalid, color: "#f97583" },
];

export const theme = createTheme({
  theme: "dark",
  settings: defaultThemeSettings,
  styles: githubDarkStyle,
});

export const spanViewStyle: CreateThemeOptions["styles"] = [
  { tag: [t.standard(t.tagName), t.tagName], color: "#7ee787" },
  { tag: [t.comment, t.bracket], color: "#8b949e" },
  { tag: [t.className], color: "#d2a8ff" },
  { tag: [t.propertyName], color: "hsl(var(--primary))" },
  { tag: [t.variableName, t.attributeName, t.number, t.operator], color: "#c9c9cd" },
  { tag: [t.keyword, t.typeName, t.typeOperator, t.typeName], color: "#ff7b72" },
  { tag: [t.string, t.meta, t.regexp], color: "#c9c9cd" },
  { tag: [t.name, t.quote], color: "#c9c9cd" },
  { tag: [t.heading, t.strong], color: "#d2a8ff", fontWeight: "bold" },
  { tag: [t.emphasis], color: "#d2a8ff", fontStyle: "italic" },
  { tag: [t.deleted], color: "#ffdcd7", backgroundColor: "#ffeef0" },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: "#c9c9cd" },
  { tag: t.link, textDecoration: "underline" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.invalid, color: "#f97583" },
];

export const spanViewTheme = createTheme({
  theme: "dark",
  settings: { ...defaultThemeSettings, foreground: "#c9c9cd" },
  styles: spanViewStyle,
});

export const baseExtensions = [
  EditorView.theme({
    "&.cm-focused": {
      outline: "none !important",
    },
    "&": {
      fontSize: "0.75rem !important",
    },
    "&.cm-editor": {
      height: "100%",
      width: "100%",
      position: "relative",
    },
    // Enhanced search match styling
    ".cm-searchMatch": {
      backgroundColor: "hsl(var(--primary) / 0.3)",
      border: "1px solid hsl(var(--primary))",
      borderRadius: "3px",
    },
    ".cm-searchMatch-selected": {
      backgroundColor: "hsl(var(--primary))",
      color: "hsl(var(--primary-foreground))",
      fontWeight: "600",
    },
    ".cm-mustache-bracket": {
      color: "#79c0ff",
      fontWeight: "bold",
    },
    ".cm-mustache-keyword": {
      color: "#ff7b72",
      fontWeight: "bold",
    },
    ".cm-mustache-variable": {
      color: "#a5d6ff",
    },
    ".cm-mustache-operator": {
      color: "#ffab70",
    },
  }),
  search({
    createPanel: () => {
      const dom = document.createElement("div");
      dom.style.height = "0px";
      return { dom };
    },
    scrollToMatch: (range) => EditorView.scrollIntoView(range, { y: "center" }),
  }),
  highlightSelectionMatches(),
  EditorView.lineWrapping,
];

export const languageExtensions = {
  python: () => python(),
  json: () => json(),
  yaml: () => yaml(),
  html: () => html(),
};

export const modes = ["TEXT", "YAML", "JSON", "CUSTOM"];

// Interface for image data
export interface ImageData {
  src: string;
  type: string;
  original: string;
}

// Image widget for displaying base64 images
export class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly maxHeight: number = 100
  ) {
    super();
  }

  toDOM() {
    const div = document.createElement("div");
    div.style.display = "inline-block";
    div.style.verticalAlign = "text-top";
    div.style.margin = "2px 0";

    const img = document.createElement("img");
    img.src = this.src;
    img.style.maxHeight = `${this.maxHeight}px`;
    img.style.borderRadius = "4px";

    div.appendChild(img);
    return div;
  }
}

// Creates decorations for image placeholders
export function createImageDecorationPlugin(imageMap: Record<string, ImageData>) {
  return ViewPlugin.fromClass(
    class {
      decorations = Decoration.none;

      constructor(view: EditorView) {
        this.updateDecorations(view);
      }

      update(update: { docChanged: boolean; view: EditorView }) {
        // Only update decorations when document changes
        if (update.docChanged) {
          this.updateDecorations(update.view);
        }
      }

      updateDecorations(view: EditorView) {
        const decorations = [];
        const text = view.state.doc.toString();

        // Look for image tags in the format [IMG:123]
        const placeholderRegex = /\[IMG:(\d+)\]/g;
        let match;

        while ((match = placeholderRegex.exec(text)) !== null) {
          const id = match[1];
          const imageData = imageMap[id];

          if (imageData) {
            const from = match.index;
            const to = from + match[0].length;

            decorations.push(
              Decoration.replace({
                widget: new ImageWidget(imageData.src),
                inclusive: false,
              }).range(from, to)
            );
          }
        }

        this.decorations = Decoration.set(decorations);
      }
    },
    {
      decorations: (v) => v.decorations,
      // Make decorations persist by using atomic ranges
      provide: (plugin) => EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations || Decoration.none),
    }
  );
}

const MIN_RAW_BASE64_LENGTH = 50;
const MIN_RAW_BASE64_RUN = 20;

const Char = {
  Quote: 34,
  Plus: 43,
  Slash: 47,
  Digit0: 48,
  Digit9: 57,
  Equals: 61,
  UpperA: 65,
  UpperZ: 90,
  LowerA: 97,
  LowerZ: 122,
} as const;

function isBase64Char(code: number): boolean {
  return (
    (code >= Char.Digit0 && code <= Char.Digit9) ||
    (code >= Char.UpperA && code <= Char.UpperZ) ||
    (code >= Char.LowerA && code <= Char.LowerZ) ||
    code === Char.Plus ||
    code === Char.Slash
  );
}

interface ImageSpan {
  start: number;
  end: number;
  original: string;
  type: string;
  src: string;
}

// A span that has been assigned its placeholder id.
type PlacedSpan = ImageSpan & { id: string };

// Linear, non-backtracking equivalent of /"([A-Za-z0-9+/]{20,}={0,2})"/g.
// Avoids the regex-engine stack overflow on multi-MB base64 tokens.
function scanRawBase64Spans(text: string): ImageSpan[] {
  const spans: ImageSpan[] = [];
  let i = 0;

  while (i < text.length) {
    if (text.charCodeAt(i) !== Char.Quote) {
      i++;
      continue;
    }

    const start = i;
    let end = i + 1;
    while (end < text.length && isBase64Char(text.charCodeAt(end))) end++;

    const runLength = end - (start + 1);
    let padding = 0;
    while (end < text.length && text.charCodeAt(end) === Char.Equals && padding < 2) {
      end++;
      padding++;
    }

    const closedByQuote = end < text.length && text.charCodeAt(end) === Char.Quote;
    if (runLength >= MIN_RAW_BASE64_RUN && closedByQuote) {
      const base64 = text.slice(start + 1, end);
      const type = base64.length >= MIN_RAW_BASE64_LENGTH ? inferImageType(base64) : null;
      if (type) {
        spans.push({
          start,
          end: end + 1,
          original: text.slice(start, end + 1),
          type,
          src: `data:${type};base64,${base64}`,
        });
      }
      i = end + 1;
    } else {
      // Re-scan from just after this quote, like the global regex would.
      i = start + 1;
    }
  }

  return spans;
}

// data:image/... URIs — [^"]+ is a non-recursive scan in V8, so this stays a regex.
function scanDataUriSpans(text: string): ImageSpan[] {
  const dataUriRegex = /"(data:image\/([^;]+);base64,([^"]+))"/g;
  const spans: ImageSpan[] = [];
  let match: RegExpExecArray | null;

  while ((match = dataUriRegex.exec(text)) !== null) {
    spans.push({
      start: match.index,
      end: match.index + match[0].length,
      original: match[0],
      type: match[2],
      src: match[1],
    });
  }

  return spans;
}

// Single-pass rebuild from position-sorted spans (avoids repeated String.replace).
// Skips any span overlapping an already-consumed one so a future sort/overlap
// regression can't silently drop interleaved text.
function replaceSpansWithPlaceholders(text: string, spans: PlacedSpan[]): string {
  if (spans.length === 0) return text;
  let result = "";
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    result += text.slice(cursor, span.start) + `"[IMG:${span.id}]"`;
    cursor = span.end;
  }
  return result + text.slice(cursor);
}

// Replaces base64 images with [IMG:n] placeholders and returns the image lookup map.
function extractBase64Images(text: string): { processedText: string; imageMap: Record<string, ImageData> } {
  const imageMap: Record<string, ImageData> = {};

  // Number data-URI spans before raw spans to match the original id ordering.
  const placedSpans: PlacedSpan[] = [...scanDataUriSpans(text), ...scanRawBase64Spans(text)].map((span, index) => {
    const id = String(index);
    imageMap[id] = { src: span.src, type: span.type, original: span.original };
    return { ...span, id };
  });

  // data-URI runs start with `data:` (the ':' breaks a base64 run), so spans never overlap.
  const spansByPosition = placedSpans.sort((a, b) => a.start - b.start);
  const processedText = replaceSpansWithPlaceholders(text, spansByPosition);

  return { processedText, imageMap };
}

// Modified renderText function that also handles base64 images
export const renderText = (mode: string, value: string, shouldProcessImages = false) => {
  // First pass: Handle base64 images if requested
  let processedText = value;
  let imageMap: Record<string, ImageData> = {};

  if (shouldProcessImages) {
    const result = extractBase64Images(value);
    processedText = result.processedText;
    imageMap = result.imageMap;
  }

  // Second pass: Format according to mode
  let formattedText = processedText;

  if (mode === "yaml") {
    try {
      formattedText = YAML.stringify(YAML.parse(processedText));
    } catch (e) {
      formattedText = processedText;
    }
  } else if (mode === "json") {
    try {
      if (JSON.parse(processedText) === processedText) {
        formattedText = processedText;
      } else {
        formattedText = JSON.stringify(JSON.parse(processedText), null, 2);
      }
    } catch (e) {
      formattedText = processedText;
    }
  }

  return {
    text: formattedText,
    imageMap: imageMap,
    hasImages: Object.keys(imageMap).length > 0,
  };
};
