"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import CodeMirror from "@uiw/react-codemirror";
import { Loader2, Sparkles } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { createExtensions, type SQLSchemaConfig, theme } from "@/components/sql/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { GenerationMode } from "@/lib/actions/sql";
import { toast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils.ts";

export interface SQLEditorProps {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  editable?: boolean;
  autoFocus?: boolean;
  className?: string;
  schema?: SQLSchemaConfig;
  generationMode?: GenerationMode;
  inputPlaceholder?: string;
  projectId?: string;
  aiButtonVariant?: "icon" | "full";
}

export default function SQLEditor({
  value,
  onChange,
  placeholder = "Enter your SQL query...",
  editable = true,
  autoFocus = false,
  className = "size-full",
  schema,
  generationMode = "query",
  inputPlaceholder = "e.g. Get top 10 most expensive traces from last 24 hours",
  projectId,
  aiButtonVariant = "icon",
}: SQLEditorProps) {
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const extensions = useMemo(() => createExtensions(schema), [schema]);

  const handleAiGenerate = useCallback(async () => {
    const prompt = aiPrompt.trim();
    if (!prompt || !projectId) return;

    setIsAiDialogOpen(false);
    setAiPrompt("");
    setIsAiLoading(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/sql/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode: generationMode, currentQuery: value || undefined }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast({
          title: "Generation failed",
          description: data?.error || "Failed to generate SQL",
          variant: "destructive",
        });
        return;
      }

      if (data.query && onChange) {
        onChange(data.query);
      }
    } catch (error) {
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsAiLoading(false);
    }
  }, [aiPrompt, projectId, generationMode, value, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleAiGenerate();
      }
    },
    [handleAiGenerate]
  );

  return (
    <div className="relative size-full">
      <CodeMirror
        placeholder={placeholder}
        theme={theme}
        className={className}
        extensions={extensions}
        editable={editable}
        autoFocus={autoFocus}
        value={value}
        onChange={onChange}
      />

      {projectId && editable && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className={cn(
                  "absolute bottom-2 right-2 z-10 flex items-center justify-center gap-1.5 h-6 px-1.5 rounded-full",
                  {
                    "w-6": aiButtonVariant === "icon",
                  }
                )}
                disabled={isAiLoading}
                size={aiButtonVariant === "icon" ? "icon" : "sm"}
                onClick={() => setIsAiDialogOpen(true)}
              >
                {isAiLoading ? (
                  <Loader2 className="size-3.5 shrink-0 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5 shrink-0" />
                )}
                {aiButtonVariant === "full" && <span>Ask AI</span>}
              </Button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent>Generate SQL with AI</TooltipContent>
            </TooltipPortal>
          </Tooltip>
        </TooltipProvider>
      )}

      <Dialog open={isAiDialogOpen} onOpenChange={setIsAiDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex gap-2 items-center">
              <Sparkles className="size-4 shrink-0" />
              Generate SQL with AI
            </DialogTitle>
            {value && (
              <p className="text-xs text-secondary-foreground">
                AI has context of your current query. You can ask to modify or extend it.
              </p>
            )}
          </DialogHeader>
          <Textarea
            ref={inputRef}
            placeholder={inputPlaceholder}
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAiDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAiGenerate} disabled={!aiPrompt.trim()}>
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
