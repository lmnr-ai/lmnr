import { closeSearchPanel, findNext, openSearchPanel, SearchQuery, setSearchQuery } from "@codemirror/search";
import { EditorView } from "@codemirror/view";
import CodeMirror, { ReactCodeMirrorProps, ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { Settings } from "lucide-react";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import TemplateRenderer from "@/components/ui/template-renderer";
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
  codeEditorClassName?: string;
  renderBase64Images?: boolean;
  defaultShowLineNumbers?: boolean;
  searchTerm?: string;
}

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
  onLoad,
  codeEditorClassName,
  renderBase64Images = true,
  defaultShowLineNumbers = false,
  searchTerm = "",
}: CodeEditorProps) => {
  const editorRef = useRef<ReactCodeMirrorRef | null>(null);
  const [mode, setMode] = useState(() => {
    if (presetKey && typeof window !== "undefined") {
      const savedMode = localStorage.getItem(`formatter-mode-${presetKey}`);
      return savedMode || defaultMode;
    }
    return defaultMode;
  });

  const [shouldRenderImages, setShouldRenderImages] = useState(renderBase64Images);

  const [showLineNumbers, setShowLineNumbers] = useState(defaultShowLineNumbers);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const {
    text: renderedValue,
    imageMap,
    hasImages,
  } = useMemo(() => renderText(mode, value, shouldRenderImages), [mode, value, shouldRenderImages]);

  const handleModeChange = useCallback(
    (newMode: string) => {
      setMode(newMode);
      if (presetKey && typeof window !== "undefined") {
        localStorage.setItem(`formatter-mode-${presetKey}`, newMode);
      }
    },
    [presetKey]
  );

  const toggleImageRendering = useCallback(() => {
    setShouldRenderImages((prev) => !prev);
  }, []);

  const toggleLineNumbers = useCallback(() => {
    setShowLineNumbers((prev) => !prev);
  }, []);

  const handleChange = useCallback(
    (editedText: string, viewUpdate: any) => {
      if (!onChange) return;

      if (shouldRenderImages && hasImages) {
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

    if (lineWrapping && renderedValue.length < MAX_LINE_WRAPPING_LENGTH) {
      extensions.push(EditorView.lineWrapping);
    }

    const languageExtension = languageExtensions[mode as keyof typeof languageExtensions];
    if (languageExtension) {
      extensions.push(languageExtension());
    }

    if (shouldRenderImages && hasImages) {
      extensions.push(createImageDecorationPlugin(imageMap));
    }

    return extensions;
  }, [mode, lineWrapping, renderedValue.length, shouldRenderImages, hasImages, imageMap, searchTerm]);

  const clearSearch = (view: EditorView) => {
    closeSearchPanel(view);

    const emptyQuery = new SearchQuery({ search: "" });
    view.dispatch({
      effects: setSearchQuery.of(emptyQuery),
    });
  };

  const applySearch = useCallback(
    (view: EditorView) => {
      const searchTermTrimmed = searchTerm.trim();
      if (searchTermTrimmed) {
        const docText = view.state.doc.toString();

        const searchRegex = new RegExp(searchTermTrimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        const hasMatch = searchRegex.test(docText);

        if (hasMatch) {
          openSearchPanel(view);

          const searchQuery = new SearchQuery({
            search: searchTermTrimmed,
            caseSensitive: false,
            literal: true,
            wholeWord: false,
            regexp: false,
          });

          view.dispatch({
            effects: setSearchQuery.of(searchQuery),
          });

          findNext(view);
          const selection = view.state.selection.main;

          view.dispatch({
            effects: EditorView.scrollIntoView(selection, { y: "start", yMargin: -4 }),
          });
        } else {
          clearSearch(view);
        }
      } else {
        closeSearchPanel(view);
      }
    },
    [searchTerm]
  );

  useEffect(() => {
    if (editorRef.current?.view && searchTerm) {
      applySearch(editorRef.current?.view);
    }
  }, [searchTerm, applySearch]);

  const renderHeaderContent = () => (
    <>
      <Select value={mode} onValueChange={handleModeChange}>
        <SelectTrigger className="h-4 px-1.5 font-medium text-secondary-foreground border-secondary-foreground/20 w-fit text-[0.7rem] outline-none focus:ring-0">
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
        className={cn(
          "h-7 w-7 ml-auto text-foreground/80 transition-opacity opacity-0 group-hover/code-highlighter:opacity-100 data-[state=open]:opacity-100",
          isSettingsOpen && "opacity-100"
        )}
        iconClassName="h-3.5 w-3.5"
        size="icon"
        variant="ghost"
        text={value}
      />
      <div
        className={cn(
          "transition-opacity opacity-0 group-hover/code-highlighter:opacity-100 data-[state=open]:opacity-100",
          isSettingsOpen && "opacity-100"
        )}
      >
        <CodeSheet
          renderedValue={value}
          mode={mode}
          onModeChange={handleModeChange}
          extensions={extensions}
          placeholder={placeholder}
        />
      </div>
      <Popover onOpenChange={setIsSettingsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-foreground/70 transition-opacity opacity-0 group-hover/code-highlighter:opacity-100 data-[state=open]:opacity-100"
          >
            <Settings size={16} />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="p-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">Show line numbers</span>
            <Switch checked={showLineNumbers} onCheckedChange={toggleLineNumbers} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Render base64 images</span>
            <Switch checked={shouldRenderImages} onCheckedChange={toggleImageRendering} />
          </div>
        </PopoverContent>
      </Popover>
    </>
  );

  return (
    <div
      className={cn("w-full min-h-[1.75rem] h-full flex flex-col border relative group/code-highlighter", className)}
    >
      <div className={cn("h-7 flex justify-end items-center pl-2 pr-1 w-full rounded-t bg-muted/50")}>
        {renderHeaderContent()}
      </div>
      {mode === "custom" ? (
        <div className="flex-grow flex bg-muted/50 overflow-auto w-full h-full">
          <TemplateRenderer data={renderedValue} presetKey={presetKey} />
        </div>
      ) : (
        <div
          className={cn(
            "flex-grow flex bg-muted/50 overflow-auto w-full h-full",
            !showLineNumbers && "pl-1",
            codeEditorClassName
          )}
        >
          <CodeMirror
            ref={editorRef}
            className="w-full"
            placeholder={placeholder}
            onChange={handleChange}
            theme={theme}
            basicSetup={{
              lineNumbers: showLineNumbers,
              foldGutter: showLineNumbers,
            }}
            extensions={extensions}
            value={renderedValue}
            readOnly={readOnly}
            onCreateEditor={applySearch}
          />
        </div>
      )}
    </div>
  );
};

const CodeHighlighter = memo(PureCodeHighlighter);

export default CodeHighlighter;
