import { json } from "@codemirror/lang-json";
import CodeMirror from "@uiw/react-codemirror";
import { PropsWithChildren, useMemo, useState } from "react";

import Markdown from "@/components/traces/trace-view/list/markdown.tsx";
import { extractKeys, generateSpanPathKey } from "@/components/traces/trace-view/list/utils.ts";
import { TraceViewListSpan, useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
import { Button } from "@/components/ui/button.tsx";
import { mustache } from "@/components/ui/content-renderer/lang-mustache.ts";
import { baseExtensions, theme } from "@/components/ui/content-renderer/utils.ts";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet.tsx";
import { useToast } from "@/lib/hooks/use-toast";

interface MustacheTemplateSheetProps {
  output: any;
  span: TraceViewListSpan | null;
}

function MustacheTemplateSheetContent({
  output,
  span,
  setOpen,
}: MustacheTemplateSheetProps & {
  setOpen: (open: boolean) => void;
}) {
  const { toast } = useToast();

  const spanPathKey = useMemo(() => (span ? generateSpanPathKey(span) : ""), [span]);

  const savedTemplate = useTraceViewStoreContext((state) => state.getSpanTemplate(spanPathKey));

  const [templateInput, setTemplateInput] = useState(savedTemplate || "");

  const { saveSpanTemplate, deleteSpanTemplate } = useTraceViewStoreContext((state) => ({
    saveSpanTemplate: state.saveSpanTemplate,
    deleteSpanTemplate: state.deleteSpanTemplate,
  }));

  const handleSaveTemplate = () => {
    if (templateInput.trim()) {
      saveSpanTemplate(spanPathKey, templateInput);
      toast({ title: "Template saved successfully" });
      setOpen(false);
    }
  };

  const handleClearTemplate = () => {
    deleteSpanTemplate(spanPathKey);
    setTemplateInput("");
  };

  const isSaved = savedTemplate === templateInput && templateInput.trim() !== "";

  const suggestions = useMemo(() => {
    if (!output) return [];
    return extractKeys(output, 10);
  }, [output]);

  return (
    <ScrollArea>
      <SheetHeader className="pt-4 px-4 flex-shrink-0">
        <SheetTitle>Mustache Template Editor</SheetTitle>
        <div className="text-xs text-muted-foreground text-left pt-2 space-y-1">
          <div>Templates are saved per span path. All spans matching this path will use this template.</div>
          <span>Path:</span> <span className="font-medium">{spanPathKey}</span>
        </div>
      </SheetHeader>
      <div className="grid gap-4 p-4">
        <div>
          <label className="text-sm font-medium mb-2 block">Output Data</label>
          {output ? (
            <div className="flex flex-1 border rounded-md bg-muted/50 overflow-hidden max-h-64">
              <CodeMirror
                className="w-full"
                value={JSON.stringify(output, null, 2)}
                readOnly
                extensions={[json(), ...baseExtensions]}
                theme={theme}
              />
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">No output available</span>
          )}
        </div>

        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">Template</label>
            {savedTemplate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClearTemplate();
                }}
                className="h-7 text-xs"
              >
                Clear
              </Button>
            )}
          </div>
          <div className="flex flex-1 border rounded-md bg-muted/50 overflow-hidden max-h-64">
            <CodeMirror
              className="w-full"
              value={templateInput}
              onChange={(value) => setTemplateInput(value)}
              extensions={[mustache, ...baseExtensions]}
              theme={theme}
              placeholder="Enter mustache template, e.g., {{key}}"
            />
          </div>
          {suggestions.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-1">Suggestions</p>
              <div className="flex flex-wrap gap-1">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.key}
                    onClick={() => {
                      const newValue = templateInput + suggestion.template;
                      setTemplateInput(newValue);
                    }}
                    className="text-xs bg-muted hover:bg-muted/80 px-2 py-1 rounded transition-colors"
                  >
                    {suggestion.key}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col flex-1 overflow-hidden">
          <label className="text-sm font-medium mb-2 block">Result</label>
          {templateInput ? (
            <Markdown
              className="flex-1 border rounded-md bg-muted/50 p-3 max-h-96"
              output={output}
              defaultValue={templateInput}
            />
          ) : (
            <span className="text-muted-foreground text-sm border rounded-md bg-muted/50 p-3">
              Enter a template to see results...
            </span>
          )}
        </div>
        <Button
          onClick={(e) => {
            e.stopPropagation();
            handleSaveTemplate();
          }}
          disabled={!templateInput.trim() || isSaved}
          className="w-fit ml-auto"
        >
          Save
        </Button>
      </div>
    </ScrollArea>
  );
}

export default function MustacheTemplateSheet({
  children,
  open,
  onOpenChange,
  output,
  span,
}: PropsWithChildren<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  output: any;
  span: TraceViewListSpan | null;
}>) {
  const spanPathKey = span ? generateSpanPathKey(span) : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {children && <SheetTrigger asChild>{children}</SheetTrigger>}
      <SheetContent side="right" className="min-w-[50vw] w-full flex flex-col gap-0">
        <MustacheTemplateSheetContent key={spanPathKey} output={output} span={span} setOpen={onOpenChange} />
      </SheetContent>
    </Sheet>
  );
}
