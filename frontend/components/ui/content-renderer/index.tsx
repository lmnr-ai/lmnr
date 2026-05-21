import { type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import CodeMirror, { type ReactCodeMirrorProps, type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { Settings } from "lucide-react";
import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import Messages, { type MessageLabel } from "@/components/traces/span-view/messages";
import { useSpanSearchRegistration } from "@/components/traces/span-view/span-search-context.tsx";
import { Button } from "@/components/ui/button";
import CodeSheet from "@/components/ui/content-renderer/code-sheet";
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
  customTheme,
  extraExtensions,
}: ContentRendererProps) => {
  const editorRef = useRef<ReactCodeMirrorRef | null>(null);
  const editorId = useId();

  const editorIdRef = useRef(`editor-${editorId}`);
  const searchRegistration = useSpanSearchRegistration();
  const currentViewRef = useRef<EditorView | null>(null);
  const [editorMountKey, setEditorMountKey] = useState(0);

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

  useEffect(() => {
    if (searchRegistration && currentViewRef.current && mode !== "custom" && mode !== "messages") {
      searchRegistration.registerEditor(editorIdRef.current, currentViewRef.current, messageIndex, contentPartIndex);

      return () => {
        searchRegistration.unregisterEditor(editorIdRef.current);
      };
    }
  }, [searchRegistration, editorMountKey, messageIndex, contentPartIndex, mode]);

  // Settings popover only applies to the CodeMirror branch.
  const isCodeMode = mode !== "custom" && mode !== "messages";

  const renderHeaderContent = () => (
    <>
      <TemplatePickerView mode={mode} onModeChange={handleModeChange} modes={modes} />
      {mode === "custom" && (
        <TemplatePickerActions
          className={cn(
            "transition-opacity data-[state=open]:opacity-100",
            isHovered || isSettingsOpen ? "opacity-100" : "opacity-0"
          )}
        />
      )}
      <CopyButton
        className={cn(
          "ml-auto text-foreground/80 transition-opacity data-[state=open]:opacity-100",
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

  return (
    <TemplatePickerProvider presetKey={presetKey ?? null} testData={value}>
      <div
        className={cn("size-full min-h-7 flex flex-col border relative overflow-hidden", className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className={cn("flex justify-end items-center gap-1 pl-2 pr-1 w-full rounded-t bg-transparent")}>
          {renderHeaderContent()}
        </div>
        {mode === "custom" ? (
          <div className="flex-1 flex bg-muted/50 overflow-auto w-full min-h-0 border-t">
            <TemplatePickerPreview data={renderedValue} />
          </div>
        ) : mode === "messages" ? (
          <div className="flex-1 flex w-full min-h-0">
            <Messages
              messages={tryParseJson(value) ?? []}
              presetKey={presetKey ?? ""}
              hideScrollToBottom={hideScrollToBottom}
              maxHeight={messageMaxHeight}
              labels={messageLabels}
            />
          </div>
        ) : (
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
        )}
      </div>
    </TemplatePickerProvider>
  );
};

const ContentRenderer = memo(PureContentRenderer);

export default ContentRenderer;
