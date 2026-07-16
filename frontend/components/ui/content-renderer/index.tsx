import { type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import CodeMirror, { type ReactCodeMirrorProps, type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { Settings } from "lucide-react";
import React, { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import Messages, { type MessageLabel, type ProcessedMessages } from "@/components/traces/span-view/messages";
import { createCodeMirrorSearchSource, createDomSearchSource } from "@/components/traces/span-view/searchable";
import { useSpanSearchRegistration } from "@/components/traces/span-view/span-search-context.tsx";
import { Button } from "@/components/ui/button";
import CodeSheet from "@/components/ui/content-renderer/code-sheet";
import { getMarkdownSource, MarkdownRenderer } from "@/components/ui/content-renderer/markdown";
import {
  baseExtensions,
  createImageDecorationPlugin,
  type ImageData,
  languageExtensions,
  modes as defaultModes,
  renderText,
  theme as defaultTheme,
} from "@/components/ui/content-renderer/utils";
import { CopyButton } from "@/components/ui/copy-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  TemplatePickerActions,
  TemplatePickerPreview,
  TemplatePickerProvider,
  TemplatePickerView,
} from "@/components/ui/template-renderer/template-picker";
import { cn, tryParseJson } from "@/lib/utils";

interface ContentRendererProps {
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
  messageIndex?: number;
  contentPartIndex?: number;
  hideScrollToBottom?: boolean;
  messageMaxHeight?: number;
  messageLabels?: MessageLabel[];
  processedMessages?: ProcessedMessages;
  customTheme?: Parameters<typeof CodeMirror>[0]["theme"];
  /**
   * Extra CodeMirror extensions appended to the built-in set. Use `Prec.highest`
   * for keymap injections that need to win over `defaultKeymap` from `basicSetup`.
   */
  extraExtensions?: Extension[];
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

const PureContentRenderer = ({
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
  messageIndex = 0,
  contentPartIndex = 0,
  hideScrollToBottom,
  messageMaxHeight,
  messageLabels,
  processedMessages,
  customTheme,
  extraExtensions,
}: ContentRendererProps) => {
  const editorRef = useRef<ReactCodeMirrorRef | null>(null);
  const editorId = useId();

  // Distinct ids per source kind: the code-mode effect's stale cleanup runs AFTER the
  // markdown layout effect's setup on a mode switch, so a shared id would let it
  // unregister the just-registered DOM source.
  const cmSourceIdRef = useRef(`editor-${editorId}-cm`);
  const domSourceIdRef = useRef(`editor-${editorId}-dom`);
  const searchRegistration = useSpanSearchRegistration();
  const currentViewRef = useRef<EditorView | null>(null);
  const markdownContainerRef = useRef<HTMLDivElement | null>(null);
  const [editorMountKey, setEditorMountKey] = useState(0);

  const [mode, setMode] = useState(() => {
    const allowed = modes.map((m) => m.toLowerCase());
    if (presetKey && typeof window !== "undefined") {
      const savedMode = localStorage.getItem(`formatter-mode-${presetKey}`);
      if (savedMode && allowed.includes(savedMode.toLowerCase())) return savedMode.toLowerCase();
    }
    return defaultMode;
  });

  const [shouldRenderImages, setShouldRenderImages] = useState(renderBase64Images);

  const [showLineNumbers, setShowLineNumbers] = useState(defaultShowLineNumbers);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

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

  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Only set hover if this is the direct target, not bubbled from a child
    if (
      e.currentTarget === e.target ||
      (e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget))
    ) {
      setIsHovered(true);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
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

    const languageExtension = languageExtensions[mode as keyof typeof languageExtensions];
    if (languageExtension) {
      extensions.push(languageExtension());
    }

    if (shouldRenderImages && hasImages) {
      extensions.push(createImageDecorationPlugin(imageMap));
    }

    if (readOnly) {
      extensions.push(EditorView.editable.of(false));
    }
    if (extraExtensions && extraExtensions.length > 0) {
      extensions.push(...extraExtensions);
    }
    return extensions;
  }, [mode, shouldRenderImages, hasImages, readOnly, imageMap, extraExtensions]);

  const handleCreateEditor = useCallback((view: EditorView) => {
    currentViewRef.current = view;
    setEditorMountKey((k) => k + 1);
  }, []);

  const isCodeMode = mode !== "custom" && mode !== "messages" && mode !== "markdown";
  const canPickMode = modes.length > 1;

  useEffect(() => {
    if (!searchRegistration || !isCodeMode || !currentViewRef.current) return;

    searchRegistration.registerSource(
      createCodeMirrorSearchSource({
        id: cmSourceIdRef.current,
        view: currentViewRef.current,
        messageIndex,
        contentPartIndex,
      })
    );

    return () => {
      searchRegistration.unregisterSource(cmSourceIdRef.current);
    };
  }, [searchRegistration, editorMountKey, messageIndex, contentPartIndex, isCodeMode]);

  useLayoutEffect(() => {
    if (!searchRegistration || mode !== "markdown") return;

    const container = markdownContainerRef.current;
    if (!container) return;

    searchRegistration.registerSource(
      createDomSearchSource({
        id: domSourceIdRef.current,
        container,
        messageIndex,
        contentPartIndex,
      })
    );

    return () => {
      searchRegistration.unregisterSource(domSourceIdRef.current);
    };
  }, [searchRegistration, mode, messageIndex, contentPartIndex, value]);

  const actionButtons = (
    <>
      <CopyButton
        className={cn(
          "text-foreground/80 transition-opacity data-[state=open]:opacity-100",
          isHovered || isSettingsOpen ? "opacity-100" : "opacity-0"
        )}
        iconClassName="h-3.5 w-3.5"
        size="icon"
        variant="ghost"
        text={value}
      />
      <div
        className={cn(
          "transition-opacity data-[state=open]:opacity-100",
          isHovered || isSettingsOpen ? "opacity-100" : "opacity-0"
        )}
      >
        <CodeSheet
          renderedValue={value}
          mode={mode}
          onModeChange={handleModeChange}
          modes={modes}
          extensions={extensions}
          placeholder={placeholder}
        />
      </div>
      {isCodeMode && (
        <Popover onOpenChange={setIsSettingsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "text-foreground/70 transition-opacity data-[state=open]:opacity-100",
                isHovered || isSettingsOpen ? "opacity-100" : "opacity-0"
              )}
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
      )}
    </>
  );

  const content = (() => {
    if (mode === "custom") {
      return (
        <div className="flex-1 flex bg-muted/50 overflow-auto w-full min-h-0 border-t">
          <TemplatePickerPreview data={renderedValue} />
        </div>
      );
    }
    if (mode === "markdown") {
      return (
        <div className="flex-1 flex w-full min-w-0 min-h-0 overflow-y-auto overflow-x-hidden">
          <MarkdownRenderer value={getMarkdownSource(value)} className="p-2" containerRef={markdownContainerRef} />
        </div>
      );
    }
    if (mode === "messages") {
      return (
        <div className="flex-1 flex w-full min-h-0">
          <Messages
            messages={tryParseJson(value) ?? []}
            processed={processedMessages}
            presetKey={presetKey ?? ""}
            hideScrollToBottom={hideScrollToBottom}
            maxHeight={messageMaxHeight}
            labels={messageLabels}
          />
        </div>
      );
    }
    return (
      <div className={cn("flex-1 flex w-full overflow-hidden", !showLineNumbers && "pl-1", codeEditorClassName)}>
        <CodeMirror
          ref={editorRef}
          className="w-full"
          placeholder={placeholder}
          onChange={handleChange}
          theme={customTheme ?? defaultTheme}
          basicSetup={{
            lineNumbers: showLineNumbers,
            foldGutter: showLineNumbers,
          }}
          extensions={extensions}
          value={renderedValue}
          readOnly={readOnly}
          onCreateEditor={handleCreateEditor}
        />
      </div>
    );
  })();

  return (
    <TemplatePickerProvider presetKey={presetKey ?? null} testData={value}>
      <div
        className={cn("size-full min-h-7 flex flex-col border relative overflow-hidden", className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {canPickMode ? (
          <>
            <div className="flex justify-end items-center gap-1 pl-2 pr-1 w-full rounded-t bg-transparent">
              <TemplatePickerView mode={mode} onModeChange={handleModeChange} modes={modes} />
              {mode === "custom" && (
                <TemplatePickerActions
                  className={cn(
                    "transition-opacity data-[state=open]:opacity-100",
                    isHovered || isSettingsOpen ? "opacity-100" : "opacity-0"
                  )}
                />
              )}
              <div className="ml-auto flex items-center gap-1">{actionButtons}</div>
            </div>
            {content}
          </>
        ) : (
          <div className="flex flex-1 min-h-0 w-full items-start">
            <div className="flex-1 min-w-0 min-h-0 flex flex-col">{content}</div>
            <div className="flex items-center shrink-0 gap-0.5 pl-0.5">{actionButtons}</div>
          </div>
        )}
      </div>
    </TemplatePickerProvider>
  );
};

const ContentRenderer = memo(PureContentRenderer);

export default ContentRenderer;
