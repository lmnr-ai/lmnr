import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import CodeMirror, { ReactCodeMirrorProps, ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { ChevronDown, ChevronUp } from "lucide-react";
import { memo, useCallback, useMemo, useRef, useState } from "react";

import CodeSheet from "@/components/traces/code-highlighter/code-sheet";
import {
  baseExtensions,
  languageExtensions,
  MAX_LINE_WRAPPING_LENGTH,
  modes as defaultModes,
  renderText,
  theme,
} from "@/components/traces/code-highlighter/utils";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface CodeEditorProps {
  onChange?: ReactCodeMirrorProps["onChange"];
  readOnly?: boolean;
  modes?: string[];
  defaultMode?: string;
  value: string;
  className?: string;
  placeholder?: string;
  lineWrapping?: boolean;
  onLoad?: () => void;
  presetKey?: string | null;
  collapsible?: boolean;
  codeEditorClassName?: string;
  renderBase64Images?: boolean;
}

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
      to: match.index + base64Data.length + 1,
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
      // Track if this is the first render
      isFirstRender = true;

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

        // Use no delay for first render, long delay for editing, short delay otherwise
        let delay = 0;

        if (this.isFirstRender) {
          // Immediate execution for first render
          delay = 0;
          this.isFirstRender = false;
        } else if (this.isEditing) {
          // Longer delay during active editing
          delay = 1000;
        }

        if (delay === 0) {
          // Immediate execution without setTimeout for first render
          this.updateDecorations(view);
          this.updateTimer = null;
          this.isEditing = false;
          this.lastUpdateTime = now;
        } else {
          this.updateTimer = setTimeout(() => {
            this.updateDecorations(view);
            this.updateTimer = null;
            this.isEditing = false;
            this.lastUpdateTime = now;
          }, delay);
        }
      }

      updateDecorations(view: EditorView) {
        const decorations = [];
        const text = view.state.doc.toString();
        const base64Images = findBase64Images(text);

        for (const { from, to, content } of base64Images) {
          decorations.push(
            Decoration.replace({
              widget: new ImageWidget(content),
              inclusive: true,
            }).range(from, to)
          );
        }

        this.decorations = Decoration.set(decorations);
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

const PureCodeHighlighter = ({
  onChange,
  readOnly,
  modes = defaultModes,
  defaultMode = "text",
  value,
  className,
  placeholder,
  lineWrapping = true,
  presetKey = null,
  collapsible = false,
  onLoad,
  codeEditorClassName,
  renderBase64Images = true,
}: CodeEditorProps) => {
  const editorRef = useRef<ReactCodeMirrorRef | null>(null);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mode, setMode] = useState(() => {
    if (presetKey && typeof window !== "undefined") {
      const savedMode = localStorage.getItem(`formatter-mode-${presetKey}`);
      return savedMode || defaultMode;
    }
    return defaultMode;
  });

  const renderedValue = useMemo(() => renderText(mode, value), [mode, value]);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  const handleModeChange = useCallback(
    (newMode: string) => {
      setMode(newMode);
      if (presetKey && typeof window !== "undefined") {
        localStorage.setItem(`formatter-mode-${presetKey}`, newMode);
      }
    },
    [presetKey]
  );

  const extensions = useMemo(() => {
    const extensions = [...baseExtensions];

    if (lineWrapping && value.length < MAX_LINE_WRAPPING_LENGTH) {
      extensions.push(EditorView.lineWrapping);
    }

    const languageExtension = languageExtensions[mode as keyof typeof languageExtensions];
    if (languageExtension) {
      extensions.push(languageExtension());
    }

    // Add base64 image rendering plugin if enabled and in JSON mode
    if (renderBase64Images) {
      extensions.push(createBase64ImagePlugin());
    }

    return extensions;
  }, [mode, lineWrapping, value.length, renderBase64Images]);

  return (
    <div className={cn("w-full h-full flex flex-col border", className)}>
      <div
        className={cn("bg-background flex items-center pl-2 pr-1 w-full rounded-t", {
          "border-b": !isCollapsed,
        })}
      >
        <Select value={mode} onValueChange={handleModeChange}>
          <SelectTrigger className="font-medium text-secondary-foreground h-5 w-fit bg-secondary text-xs border-gray-600">
            <SelectValue className="w-fit" placeholder="Select mode" />
          </SelectTrigger>
          <SelectContent>
            {modes.map((mode) => (
              <SelectItem key={mode} value={mode.toLowerCase()}>
                {mode}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {collapsible && (
          <Button
            variant="ghost"
            className="flex items-center gap-1 text-secondary-foreground"
            onClick={toggleCollapsed}
          >
            {isCollapsed ? (
              <>
                show
                <ChevronDown size={16} />
              </>
            ) : (
              <>
                hide
                <ChevronUp size={16} />
              </>
            )}
          </Button>
        )}
        <CopyButton
          className="h-7 w-7 ml-auto"
          iconClassName="h-3.5 w-3.5"
          size="icon"
          variant="ghost"
          text={renderedValue}
        />
        <CodeSheet renderedValue={renderedValue} mode={mode} onModeChange={handleModeChange} extensions={extensions} />
      </div>
      <div
        className={cn("flex-grow flex bg-card overflow-auto w-full h-fit", { "h-0": isCollapsed }, codeEditorClassName)}
      >
        <CodeMirror
          ref={editorRef}
          className="w-full"
          placeholder={placeholder}
          onChange={onChange}
          theme={theme}
          extensions={extensions}
          value={renderedValue}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
};

const CodeHighlighter = memo(PureCodeHighlighter);

export default CodeHighlighter;
