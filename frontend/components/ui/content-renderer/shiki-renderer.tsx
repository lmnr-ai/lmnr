import { Settings } from "lucide-react";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type BundledLanguage, type BundledTheme, type HighlighterGeneric } from "shiki";

import Messages from "@/components/traces/span-view/messages";
import { Button } from "@/components/ui/button";
import { type ImageData, renderText } from "@/components/ui/content-renderer/utils";
import { CopyButton } from "@/components/ui/copy-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import TemplateRenderer from "@/components/ui/template-renderer";
import { cn, tryParseJson } from "@/lib/utils";

// Module-level cached highlighter promise to avoid reloading WASM/grammars on every render
let highlighterPromise: Promise<HighlighterGeneric<BundledLanguage, BundledTheme>> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki")
      .then((shiki) =>
        shiki.createHighlighter({
          themes: ["github-dark"],
          langs: ["json", "yaml", "html", "python"],
        })
      )
      .catch((err) => {
        // Clear the cached promise so subsequent calls can retry
        highlighterPromise = null;
        throw err;
      });
  }
  return highlighterPromise;
}

const SHIKI_LANG_MAP: Record<string, BundledLanguage> = {
  json: "json",
  yaml: "yaml",
  html: "html",
  python: "python",
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrapInPlainPre(text: string): string {
  return `<pre class="shiki github-dark" style="background-color:transparent;color:#c9d1d9" tabindex="0"><code>${escapeHtml(text)}</code></pre>`;
}

// Replace [IMG:n] placeholders in rendered HTML with actual <img> elements.
// Shiki may split placeholders across multiple <span> tokens, so we operate
// on the raw HTML string and match both plain and HTML-entity-encoded forms.
function replaceImagePlaceholders(html: string, imageMap: Record<string, ImageData>): string {
  let result = html;
  for (const [id, data] of Object.entries(imageMap)) {
    // The placeholder text [IMG:id] may appear literally or with the
    // brackets entity-encoded depending on how Shiki tokenises the text.
    const literal = `[IMG:${id}]`;
    const encoded = `&#x5B;IMG:${id}&#x5D;`;
    const imgTag = `<img src="${data.src}" style="max-height:100px;border-radius:4px;display:inline-block;vertical-align:text-top;margin:2px 0" />`;
    result = result.replaceAll(literal, imgTag);
    result = result.replaceAll(encoded, imgTag);
  }
  return result;
}

const defaultModes = ["TEXT", "YAML", "JSON", "CUSTOM"];

interface ShikiContentRendererProps {
  modes?: string[];
  defaultMode?: string;
  value: string;
  className?: string;
  presetKey?: string | null;
  codeEditorClassName?: string;
  renderBase64Images?: boolean;
  messageIndex?: number;
  contentPartIndex?: number;
  hideScrollToBottom?: boolean;
  messageMaxHeight?: number;
}

const PureShikiContentRenderer = ({
  modes = defaultModes,
  defaultMode = "text",
  value,
  className,
  presetKey = null,
  codeEditorClassName,
  renderBase64Images = true,
  hideScrollToBottom,
  messageMaxHeight,
}: ShikiContentRendererProps) => {
  const [mode, setMode] = useState(() => {
    if (presetKey && typeof window !== "undefined") {
      const savedMode = localStorage.getItem(`formatter-mode-${presetKey}`);
      return savedMode || defaultMode;
    }
    return defaultMode;
  });

  const [shouldRenderImages, setShouldRenderImages] = useState(renderBase64Images);
  const [showLineNumbers, setShowLineNumbers] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  // Track highlighted HTML together with the inputs that produced it,
  // so we can detect when it's stale (e.g. during async mode switches).
  const [shikiResult, setShikiResult] = useState<{ key: string; html: string }>({ key: "", html: "" });
  const contentRef = useRef<HTMLDivElement>(null);

  const {
    text: renderedValue,
    imageMap,
    hasImages,
  } = useMemo(() => renderText(mode, value, shouldRenderImages), [mode, value, shouldRenderImages]);

  // A stable key identifying the current input combination for Shiki rendering
  const shikiKey = `${mode}:${renderedValue}`;

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

  const lang = SHIKI_LANG_MAP[mode];

  // Generate highlighted HTML using Shiki for supported languages
  useEffect(() => {
    if (!lang || mode === "custom" || mode === "messages") {
      return;
    }

    let cancelled = false;
    const currentKey = shikiKey;

    getHighlighter()
      .then((highlighter) => {
        if (cancelled) return;
        let html = highlighter.codeToHtml(renderedValue, {
          lang,
          theme: "github-dark",
        });
        if (hasImages) {
          html = replaceImagePlaceholders(html, imageMap);
        }
        setShikiResult({ key: currentKey, html });
      })
      .catch(() => {
        // Highlighter failed to load — fall back to plain text rendering
        if (!cancelled) {
          setShikiResult({ key: currentKey, html: wrapInPlainPre(renderedValue) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [renderedValue, mode, lang, hasImages, imageMap, shikiKey]);

  // For "text" mode or unknown languages, compute plain HTML synchronously via memo
  const plainHtml = useMemo(() => {
    if (lang || mode === "custom" || mode === "messages") {
      return "";
    }
    let html = wrapInPlainPre(renderedValue);
    if (hasImages) {
      html = replaceImagePlaceholders(html, imageMap);
    }
    return html;
  }, [renderedValue, mode, lang, hasImages, imageMap]);

  // Only use cached Shiki HTML if it matches the current inputs; otherwise show
  // nothing while the async highlight is in-flight to avoid flashing stale content.
  const displayHtml = lang ? (shikiResult.key === shikiKey ? shikiResult.html : "") : plainHtml;

  return (
    <div
      className={cn("size-full min-h-7 flex flex-col border relative", className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className={cn("flex justify-end items-center pl-2 pr-1 w-full rounded-t bg-transparent")}>
        <Select value={mode} onValueChange={handleModeChange}>
          <SelectTrigger className="h-4 px-1.5 bg-muted font-medium text-secondary-foreground border-secondary-foreground/20 w-fit text-[0.7rem] outline-hidden focus:ring-0">
            <SelectValue className="w-fit" placeholder="Select mode" />
          </SelectTrigger>
          <SelectContent>
            {modes.map((m) => (
              <SelectItem key={m} value={m.toLowerCase()} className="text-xs">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
      </div>
      {mode === "custom" ? (
        <div className="flex-1 flex bg-muted/50 overflow-auto w-full min-h-0">
          <TemplateRenderer data={renderedValue} presetKey={presetKey} />
        </div>
      ) : mode === "messages" ? (
        <div className="flex-1 flex w-full min-h-0">
          <Messages
            messages={tryParseJson(value) ?? []}
            presetKey={presetKey ?? ""}
            hideScrollToBottom={hideScrollToBottom}
            maxHeight={messageMaxHeight}
          />
        </div>
      ) : (
        <div
          ref={contentRef}
          className={cn(
            "shiki-content-wrapper flex-1 w-full overflow-auto",
            showLineNumbers ? "shiki-line-numbers" : "pl-1",
            codeEditorClassName
          )}
          dangerouslySetInnerHTML={{ __html: displayHtml }}
        />
      )}
    </div>
  );
};

const ShikiContentRenderer = memo(PureShikiContentRenderer);

export default ShikiContentRenderer;
