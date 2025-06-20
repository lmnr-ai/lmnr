import { EditorView, lineNumbers } from "@codemirror/view";
import { Compartment } from "@codemirror/state";
import CodeMirror, { ReactCodeMirrorProps, ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { ChevronDown, ChevronUp, Settings } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import CodeSheet from "@/components/ui/code-highlighter/code-sheet";
import {
  baseExtensions,
  createImageDecorationPlugin,
  ImageData,
  languageExtensions,
  MAX_LINE_WRAPPING_LENGTH,
  modes as defaultModes,
  renderText,
  theme,
} from "@/components/ui/code-highlighter/utils";
import { CopyButton } from "@/components/ui/copy-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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

// Restore original value from placeholder text when user edits content
function restoreOriginalFromPlaceholders(newText: string, imageMap: Record<string, ImageData>): string {
  let restoredText = newText;

  // Replace each placeholder with the original value
  for (const [id, data] of Object.entries(imageMap)) {
    const placeholder = `"[IMG:${id}]"`;
    restoredText = restoredText.replace(placeholder, data.original);
  }

  return restoredText;
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
  const lineNumbersCompartment = useRef(new Compartment());
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  const [mode, setMode] = useState(() => {
    if (presetKey && typeof window !== "undefined") {
      const savedMode = localStorage.getItem(`formatter-mode-${presetKey}`);
      return savedMode || defaultMode;
    }
    return defaultMode;
  });

  // State for rendering base64 images
  const [shouldRenderImages, setShouldRenderImages] = useState(renderBase64Images);

  // State for showing line numbers
  const [showLineNumbers, setShowLineNumbers] = useState(true);

  // Process the value using the enhanced renderText function
  const {
    text: renderedValue,
    imageMap,
    hasImages,
  } = useMemo(() => renderText(mode, value, shouldRenderImages), [mode, value, shouldRenderImages]);

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

  // Toggle base64 image rendering
  const toggleImageRendering = useCallback(() => {
    setShouldRenderImages((prev) => !prev);
  }, []);

  // Toggle line numbers
  const toggleLineNumbers = useCallback(() => {
    setShowLineNumbers((prev) => !prev);
  }, []);

  // Update line numbers when showLineNumbers changes
  useEffect(() => {
    if (editorRef.current?.view) {
      editorRef.current.view.dispatch({
        effects: lineNumbersCompartment.current.reconfigure(
          showLineNumbers ? lineNumbers() : []
        ),
      });
    }
  }, [showLineNumbers]);

  // Handle changes, restoring original base64 values if needed
  const handleChange = useCallback(
    (editedText: string, viewUpdate: any) => {
      if (!onChange) return;

      if (shouldRenderImages && hasImages) {
        // Restore original base64 strings from placeholders
        const restoredText = restoreOriginalFromPlaceholders(editedText, imageMap);
        onChange(restoredText, viewUpdate);
      } else {
        onChange(editedText, viewUpdate);
      }
    },
    [onChange, shouldRenderImages, hasImages, imageMap]
  );

  const extensions = useMemo(() => {
    const extensions = [...baseExtensions];

    // Add line numbers compartment (initialize with default state - line numbers enabled)
    extensions.push(
      lineNumbersCompartment.current.of(lineNumbers())
    );

    if (lineWrapping && renderedValue.length < MAX_LINE_WRAPPING_LENGTH) {
      extensions.push(EditorView.lineWrapping);
    }

    const languageExtension = languageExtensions[mode as keyof typeof languageExtensions];
    if (languageExtension) {
      extensions.push(languageExtension());
    }

    // Add base64 image rendering plugin if enabled and images were found
    if (shouldRenderImages && hasImages) {
      extensions.push(createImageDecorationPlugin(imageMap));
    }

    return extensions;
  }, [mode, lineWrapping, renderedValue.length, shouldRenderImages, hasImages, imageMap]);

  return (
    <div
      className={cn("w-full h-full flex flex-col border relative", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Config div - shown on hover, positioned above CodeMirror */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black via-black/60 to-transparent h-7 flex justify-end items-center pl-2 pr-1 w-full rounded-t transition-opacity duration-200",
          {
            "opacity-100": isHovered || isDropdownOpen || isSelectOpen,
            "opacity-0 pointer-events-none": !isHovered && !isDropdownOpen && !isSelectOpen,
          }
        )}
      >
        <Select value={mode} onValueChange={handleModeChange} onOpenChange={setIsSelectOpen}>
          <SelectTrigger className="h-4 px-1.5 [&>svg]:opacity-100 font-medium text-secondary-foreground border-secondary-foreground/60 w-fit text-[0.7rem] bg-black/50 outline-none focus:ring-0">
            <SelectValue className="w-fit" placeholder="Select mode" />
          </SelectTrigger>
          <SelectContent>
            {modes.map((mode) => (
              <SelectItem key={mode} value={mode.toLowerCase()} className="text-xs">
                {mode}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <CopyButton
          className="h-7 w-7 ml-auto"
          iconClassName="h-3.5 w-3.5"
          size="icon"
          variant="ghost"
          text={value} // Use original value for copying
        />
        <CodeSheet
          renderedValue={value}
          mode={mode}
          onModeChange={handleModeChange}
          extensions={extensions}
          placeholder={placeholder}
        />
        {/* Settings dropdown with image rendering toggle */}
        <DropdownMenu onOpenChange={setIsDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-secondary-foreground">
              <Settings size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="flex items-center justify-between cursor-default">
              <span>Show line numbers</span>
              <Switch checked={showLineNumbers} onCheckedChange={toggleLineNumbers} className="ml-2" />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="flex items-center justify-between cursor-default">
              <span>Render base64 images</span>
              <Switch checked={shouldRenderImages} onCheckedChange={toggleImageRendering} className="ml-2" />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* CodeMirror container */}
      <div
        className={cn(
          "flex-grow flex bg-muted/50 overflow-auto w-full h-full",
          { "h-0": isCollapsed },
          codeEditorClassName
        )}
      >
        <CodeMirror
          ref={editorRef}
          className="w-full"
          placeholder={placeholder}
          onChange={handleChange}
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
