import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { yaml } from "@codemirror/lang-yaml";
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import { githubDarkStyle } from "@uiw/codemirror-theme-github";
import { createTheme } from "@uiw/codemirror-themes";
import CodeMirror from "@uiw/react-codemirror";
import { debounce } from "lodash";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";

import { cn } from "@/lib/utils";

interface CodeEditorProps {
  value: string;
  className?: string;
  language?: string;
  editable?: boolean;
  onChange?: (value: string) => void;
  placeholder?: string;
  lineWrapping?: boolean;
  renderBase64Images?: boolean;
}

const myTheme = createTheme({
  theme: "dark",
  settings: {
    fontSize: "11pt",
    background: "transparent",
    lineHighlight: "transparent",
    gutterBackground: "#1D1D20",
    gutterBorder: "transparent",
    gutterForeground: "gray !important",
    selection: "#193860",
    selectionMatch: "transparent",
    caret: "2px solid hsl(var(--primary) / 0.1)",
  },
  styles: githubDarkStyle,
});

const MAX_LINE_WRAPPING_LENGTH = 500000;

// Image widget for displaying base64 images
class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly maxHeight: number = 100) {
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

// Function to detect base64 image patterns in text
function findBase64Images(text: string) {
  const matches = [];

  // Pattern 1: Look for data URI image patterns with proper prefix
  const dataUriRegex = /"(data:image\/[^;]+;base64,[^"]+)"/g;
  let match;

  while ((match = dataUriRegex.exec(text)) !== null) {
    matches.push({
      from: match.index,
      to: match.index + match[1].length,
      content: match[1]
    });
  }

  // Pattern 2: Look for raw base64 patterns without prefix
  // We need to find quoted strings that look like base64 image data
  const rawBase64Regex = /"([A-Za-z0-9+/]{20,}={0,2})"/g;

  while ((match = rawBase64Regex.exec(text)) !== null) {
    const base64Data = match[1];

    // Skip if it's too short to be an image (arbitrary min length)
    if (base64Data.length < 50) continue;

    // Identify image type by checking the first characters
    let imageType = null;

    if (base64Data.startsWith("/9j/")) {
      imageType = "image/jpeg";
    } else if (base64Data.startsWith("iVBORw0KGgo")) {
      imageType = "image/png";
    } else if (base64Data.startsWith("R0lGODlh")) {
      imageType = "image/gif";
    } else if (base64Data.startsWith("UklGR")) {
      imageType = "image/webp";
    } else if (base64Data.startsWith("PHN2Zz")) {
      imageType = "image/svg+xml";
    } else {
      // Skip if we can't identify the image type
      continue;
    }

    // Create a proper data URI
    const content = `data:${imageType};base64,${base64Data}`;

    matches.push({
      from: match.index,
      to: match.index + base64Data.length + 1, // +1 to account for the position after the content
      content
    });
  }

  return matches;
}

// Plugin to create decorations for base64 images
function createBase64ImagePlugin() {
  return ViewPlugin.fromClass(
    class {
      decorations = Decoration.none;
      // Use a timer to debounce decoration updates
      updateTimer: NodeJS.Timeout | null = null;
      // Track if we're in the middle of an edit session
      isEditing = false;
      // Track last update time
      lastUpdateTime = 0;

      constructor(view: EditorView) {
        this.scheduleUpdate(view);
      }

      update(update: { docChanged: boolean; view: EditorView }) {
        if (update.docChanged) {
          // Mark that we're editing
          this.isEditing = true;
          this.scheduleUpdate(update.view);
        }
      }

      scheduleUpdate(view: EditorView) {
        // Clear existing timer if any
        if (this.updateTimer) {
          clearTimeout(this.updateTimer);
        }

        const now = Date.now();
        // Use a longer delay if we're in an edit session
        const delay = this.isEditing ? 1000 : 100;

        this.updateTimer = setTimeout(() => {
          this.updateDecorations(view);
          this.updateTimer = null;
          this.isEditing = false;
          this.lastUpdateTime = now;
        }, delay);
      }

      updateDecorations(view: EditorView) {
        const decorations = [];
        const visibleRanges = this.getVisibleRanges(view);

        // Only process visible portions of the document
        for (const { from, to } of visibleRanges) {
          const text = view.state.doc.sliceString(from, to);
          const base64Images = findBase64Images(text);

          for (const { from: imgFrom, to: imgTo, content } of base64Images) {
            decorations.push(
              Decoration.replace({
                widget: new ImageWidget(content),
                inclusive: false,
              }).range(from + imgFrom, from + imgTo)
            );
          }
        }

        this.decorations = Decoration.set(decorations);
      }

      // Helper to get approximately visible document ranges
      getVisibleRanges(view: EditorView) {
        const dom = view.scrollDOM;
        const { top, bottom } = dom.getBoundingClientRect();

        // Get an estimate of lines visible in viewport
        const startLine = Math.max(0, Math.floor(view.lineBlockAtHeight(top - dom.scrollTop).from / 80));
        const endLine = Math.min(
          view.state.doc.lines,
          Math.ceil(view.lineBlockAtHeight(bottom - dom.scrollTop).to / 80) + 10
        );

        // Add margin lines for smoother scrolling
        const marginLines = 20;
        const safeStartLine = Math.max(0, startLine - marginLines);
        const safeEndLine = Math.min(view.state.doc.lines, endLine + marginLines);

        // Get positions from line numbers
        const from = view.state.doc.line(safeStartLine || 1).from;
        const to = view.state.doc.line(safeEndLine || 1).to;

        return [{ from, to }];
      }

      destroy() {
        if (this.updateTimer) {
          clearTimeout(this.updateTimer);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
}

// Move these outside the component since they don't need to be recreated
const baseExtensions = [
  EditorView.theme({
    "&.cm-focused": {
      outline: "none !important",
    },
    "&": {
      fontSize: "10pt !important",
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
  }),
];

const languageExtensions = {
  python: () => python(),
  json: () => json(),
  yaml: () => yaml(),
  html: () => html(),
};

export default function CodeEditor({
  value,
  language = "text",
  editable = false,
  onChange,
  className,
  placeholder,
  lineWrapping = true,
  renderBase64Images = true,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const { ref: inViewRef, inView } = useInView({
    threshold: 0,
    triggerOnce: false,
  });

  // Update dimensions when the container size changes
  useEffect(() => {
    if (containerRef.current && inView) {
      const updateDimensions = () => {
        setDimensions({
          width: containerRef.current?.offsetWidth || 0,
          height: containerRef.current?.offsetHeight || 0,
        });
      };

      const resizeObserver = new ResizeObserver(debounce(updateDimensions, 100));
      resizeObserver.observe(containerRef.current);

      return () => resizeObserver.disconnect();
    }
  }, [inView]);

  // Combine refs
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      inViewRef(node);
    },
    [inViewRef]
  );

  // Memoize extensions to prevent recreating them on every render
  const extensions = useMemo(() => {
    const extensions = [...baseExtensions];

    if (lineWrapping && value.length < MAX_LINE_WRAPPING_LENGTH) {
      extensions.push(EditorView.lineWrapping);
    }

    const languageExtension = languageExtensions[language as keyof typeof languageExtensions];
    if (languageExtension) {
      extensions.push(languageExtension());
    }

    // Add base64 image rendering plugin if enabled and language is JSON
    if (renderBase64Images) {
      extensions.push(createBase64ImagePlugin());
    }
    return extensions;
  }, [language, lineWrapping, value.length, renderBase64Images]);

  // Render a placeholder with preserved dimensions when not in view
  if (!inView) {
    return (
      <div
        ref={setRefs}
        style={
          dimensions
            ? {
              width: `${dimensions.width}px`,
              height: `${dimensions.height}px`,
            }
            : undefined
        }
      />
    );
  }

  return (
    <div className={cn("w-full h-full bg-card text-foreground", className)}>
      <CodeMirror
        placeholder={placeholder}
        theme={myTheme}
        className="h-full"
        extensions={extensions}
        editable={editable}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}
