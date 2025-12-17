import { json } from "@codemirror/lang-json";
import { DialogDescription } from "@radix-ui/react-dialog";
import CodeMirror from "@uiw/react-codemirror";
import React, { useEffect, useMemo, useState } from "react";

import Markdown from "@/components/traces/trace-view/list/markdown.tsx";
import { extractKeys, generateSpanPathKey } from "@/components/traces/trace-view/list/utils.ts";
import { TraceViewListSpan, useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
import { Button } from "@/components/ui/button.tsx";
import { mustache } from "@/components/ui/content-renderer/lang-mustache.ts";
import { baseExtensions, theme } from "@/components/ui/content-renderer/utils.ts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";

interface MustacheTemplateDialogProps {
  output: any;
  isLoadingOutput: boolean;
  span: TraceViewListSpan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MustacheTemplateDialog = ({ output, isLoadingOutput, span, open, onOpenChange }: MustacheTemplateDialogProps) => {
  const [templateInput, setTemplateInput] = useState("");

  const spanPathKey = useMemo(() => generateSpanPathKey(span), [span]);

  const savedTemplate = useTraceViewStoreContext((state) => state.getSpanTemplate(spanPathKey));

  const { saveSpanTemplate, deleteSpanTemplate } = useTraceViewStoreContext((state) => ({
    saveSpanTemplate: state.saveSpanTemplate,
    deleteSpanTemplate: state.deleteSpanTemplate,
  }));

  useEffect(() => {
    if (open && savedTemplate) {
      setTemplateInput(savedTemplate);
    }
  }, [open, savedTemplate]);

  const handleSaveTemplate = () => {
    if (templateInput.trim()) {
      saveSpanTemplate(spanPathKey, templateInput);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 flex-shrink-0">
          <DialogTitle>Mustache Template Editor</DialogTitle>
          <div className="text-xs text-muted-foreground text-left pt-2 space-y-1">
            <div>Templates are saved per span path. All spans matching this path will use this template.</div>
            <span>Path:</span> <span className="font-medium">{spanPathKey}</span>
          </div>
          <DialogDescription />
        </DialogHeader>
        <div className="overflow-y-auto overflow-x-hidden flex-1">
          <div className="grid gap-4 px-6 pb-6 pt-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Output Data</label>
              {output ? (
                <div className="flex flex-1 border rounded-md bg-muted/50 overflow-hidden min-h-32 max-h-64">
                  <CodeMirror
                    className="w-full"
                    value={JSON.stringify(output, null, 2)}
                    readOnly
                    extensions={[json(), ...baseExtensions]}
                    theme={theme}
                  />
                </div>
              ) : (
                <span className="text-muted-foreground">No output available</span>
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
              <div className="flex flex-1 border rounded-md bg-muted/50 overflow-hidden min-h-32 max-h-64">
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
            <div className="flex flex-col h-60 overflow-hidden">
              <label className="text-sm font-medium mb-2 block">Result</label>
              {templateInput ? (
                <Markdown
                  className="flex-1 border rounded-md bg-muted/50 p-3"
                  output={output}
                  isLoadingOutput={isLoadingOutput}
                  defaultValue={templateInput}
                />
              ) : (
                <span className="text-muted-foreground text-sm">Enter a template to see results...</span>
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
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MustacheTemplateDialog;
