"use client";
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { yaml } from "@codemirror/lang-yaml";
import { highlightSelectionMatches, search } from "@codemirror/search";
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { createTheme, CreateThemeOptions } from "@uiw/codemirror-themes";
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

export const MAX_LINE_WRAPPING_LENGTH = 500000;
export const baseExtensions = [
  EditorView.theme({
    "&.cm-focused": {
      outline: "none !important",
    },
    "&": {
      fontSize: "0.75rem !important",
    },
    "&.cm-editor": {
      flex: 1,
      height: "100%",
      width: "100%",
      position: "relative",
    },
    "&.cm-scroller": {
      position: "absolute !important",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      overflow: "auto",
    },
    // Hide the search panel but keep functionality
    ".cm-panels": {
      display: "none !important",
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
      fontWeight: "500",
    },
  }),
  search(),
  highlightSelectionMatches(),
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

// Extracts base64 images and returns processed text with placeholder tags
function extractBase64Images(text: string): { processedText: string; imageMap: Record<string, ImageData> } {
  const imageMap: Record<string, ImageData> = {};
  let processedText = text;
  let imageCount = 0;

  // Pattern 1: Look for data URI image patterns
  const dataUriRegex = /"(data:image\/([^;]+);base64,([^"]+))"/g;
  let match;

  // Collect matches first to avoid issues with string replacements changing positions
  const matches: Array<{ fullMatch: string; dataUri: string; type: string; base64: string }> = [];

  while ((match = dataUriRegex.exec(text)) !== null) {
    matches.push({
      fullMatch: match[0],
      dataUri: match[1],
      type: match[2],
      base64: match[3],
    });
  }

  // Now replace them all with numbered placeholders
  for (const { fullMatch, dataUri, type } of matches) {
    const id = String(imageCount++);
    imageMap[id] = {
      src: dataUri,
      type,
      original: fullMatch,
    };
    processedText = processedText.replace(fullMatch, `"[IMG:${id}]"`);
  }

  // Pattern 2: Raw base64 patterns
  const rawBase64Regex = /"([A-Za-z0-9+/]{20,}={0,2})"/g;
  const rawMatches: Array<{ fullMatch: string; base64Data: string }> = [];

  while ((match = rawBase64Regex.exec(text)) !== null) {
    rawMatches.push({
      fullMatch: match[0],
      base64Data: match[1],
    });
  }

  for (const { fullMatch, base64Data } of rawMatches) {
    // Skip if it's too short to be an image
    if (base64Data.length < 50) continue;

    // Identify image type by checking the first characters
    let imageType = null;

    imageType = inferImageType(base64Data);

    if (!imageType) continue;

    const dataUri = `data:${imageType};base64,${base64Data}`;
    const id = String(imageCount++);

    imageMap[id] = {
      src: dataUri,
      type: imageType,
      original: fullMatch,
    };

    processedText = processedText.replace(fullMatch, `"[IMG:${id}]"`);
  }

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
