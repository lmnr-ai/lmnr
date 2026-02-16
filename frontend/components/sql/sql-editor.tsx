"use client";

import CodeMirror from "@uiw/react-codemirror";
import { Loader2, Sparkles } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { createExtensions, type SQLSchemaConfig, theme } from "@/components/sql/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface SQLEditorProps {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  editable?: boolean;
  autoFocus?: boolean;
  className?: string;
  schema?: SQLSchemaConfig;
  projectId?: string;
}

export default function SQLEditor({
  value,
  onChange,
  placeholder = "Enter your SQL query...",
  editable = true,
  autoFocus = false,
  className = "size-full",
  schema,
  projectId,
}: SQLEditorProps) {
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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
        body: JSON.stringify({
          prompt,
          schemaConfig: schema,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Failed to generate query");
      }

      const { query } = await response.json();
      if (query && onChange) {
        onChange(query);
      }
    } catch (error) {
      console.error("AI generation failed:", error);
    } finally {
      setIsAiLoading(false);
    }
  }, [aiPrompt, projectId, schema, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
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
        <Button
          size="icon"
          className="absolute bottom-2 right-2 z-10 rounded-full shadow-md"
          disabled={isAiLoading}
          onClick={() => setIsAiDialogOpen(true)}
        >
          {isAiLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        </Button>
      )}

      <Dialog open={isAiDialogOpen} onOpenChange={setIsAiDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate SQL with AI</DialogTitle>
            <DialogDescription>
              Describe the query you want and AI will generate ClickHouse SQL for you.
            </DialogDescription>
          </DialogHeader>
          <input
            ref={inputRef}
            type="text"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="e.g. Get top 10 most expensive traces from last 24 hours"
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
              <Sparkles className="size-3.5 mr-1" />
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
