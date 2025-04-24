import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { ChevronDown, ChevronUp, Copy } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";

import CodeSheet from "@/components/traces/code-highlighter/code-sheet";
import {
  baseExtensions,
  languageExtensions,
  MAX_LINE_WRAPPING_LENGTH,
  modes,
  renderText,
  theme,
} from "@/components/traces/code-highlighter/utils";
import { Button } from "@/components/ui/button";
import CopyToClipboardButton from "@/components/ui/copy-to-clipboard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface CodeEditorProps {
  value: string;
  className?: string;
  language?: string;
  placeholder?: string;
  lineWrapping?: boolean;
  onLoad?: () => void;
  presetKey?: string | null;
  collapsible?: boolean;
}

const defaultMode = "text";

const PureCodeHighlighter = ({
  value,
  language = "text",
  className,
  placeholder,
  lineWrapping = true,
  presetKey = null,
  collapsible = false,
  onLoad,
}: CodeEditorProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mode, setMode] = useState(() => {
    if (presetKey) {
      const savedMode =
        typeof window !== "undefined" ? localStorage.getItem(`formatter-mode-${presetKey}`) : defaultMode;
      return savedMode || defaultMode;
    }
    return defaultMode;
  });

  const renderedValue = useMemo(() => renderText(mode, value), [mode, value]);

  const handleModeChange = useCallback(
    (newMode: string) => {
      setMode(newMode);
      if (presetKey) {
        if (typeof window !== "undefined") {
          localStorage.setItem(`formatter-mode-${presetKey}`, newMode);
        }
      }
    },
    [presetKey]
  );

  const extensions = useMemo(() => {
    const extensions = [...baseExtensions];

    if (lineWrapping && value.length < MAX_LINE_WRAPPING_LENGTH) {
      extensions.push(EditorView.lineWrapping);
    }

    const languageExtension = languageExtensions[language as keyof typeof languageExtensions];
    if (languageExtension) {
      extensions.push(languageExtension());
    }

    return extensions;
  }, [language, lineWrapping, value.length]);

  return (
    <div className={cn("w-full h-full flex flex-col border rounded", className)}>
      <div className={cn("bg-background flex items-center py-1 pl-2 pr-1 w-full", { "border-b": !isCollapsed })}>
        <Select value={mode} onValueChange={handleModeChange}>
          <SelectTrigger className="font-medium text-secondary-foreground h-5 w-fit bg-secondary text-xs border-gray-600">
            <SelectValue className="w-fit" placeholder="Select mode" />
          </SelectTrigger>
          <SelectContent>
            {modes.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {mode.toUpperCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {collapsible && (
          <Button
            variant="ghost"
            className="flex items-center gap-1 text-secondary-foreground"
            onClick={() => setIsCollapsed(!isCollapsed)}
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
        <CopyToClipboardButton className="h-7 w-7 ml-auto" text={renderedValue}>
          <Copy className="h-3.5 w-3.5" />
        </CopyToClipboardButton>
        <CodeSheet renderedValue={renderedValue} mode={mode} onModeChange={handleModeChange} extensions={extensions} />
      </div>
      {!isCollapsed && (
        <div className="flex-grow flex bg-card overflow-auto w-full">
          <CodeMirror
            onUpdate={onLoad}
            placeholder={placeholder}
            theme={theme}
            className="h-full"
            extensions={extensions}
            value={renderedValue}
          />
        </div>
      )}
    </div>
  );
};

const CodeHighlighter = memo(PureCodeHighlighter);

export default CodeHighlighter;
