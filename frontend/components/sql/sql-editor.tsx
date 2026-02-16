"use client";

import CodeMirror from "@uiw/react-codemirror";
import { motion } from "framer-motion";
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
import { Textarea } from "@/components/ui/textarea.tsx";

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
        <motion.button
          className="absolute bottom-2 right-2 z-10 flex items-center h-7 rounded-full bg-primary/90 text-primary-foreground/90 hover:bg-primary border border-white/25 shadow-md overflow-hidden disabled:opacity-50 disabled:pointer-events-none text-xs font-medium"
          disabled={isAiLoading}
          onClick={() => setIsAiDialogOpen(true)}
          initial={false}
          whileHover="hovered"
          variants={{
            hovered: { paddingLeft: 8, paddingRight: 10 },
          }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          style={{ paddingLeft: 6, paddingRight: 6 }}
        >
          {isAiLoading ? (
            <Loader2 className="size-4 shrink-0 animate-spin" />
          ) : (
            <Sparkles className="size-4 shrink-0" />
          )}
          <motion.span
            className="whitespace-nowrap text-xs font-medium"
            variants={{
              hovered: { width: "auto", opacity: 1, marginLeft: 6 },
            }}
            initial={{ width: 0, opacity: 0, marginLeft: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: "hidden" }}
          >
            Ask AI
          </motion.span>
        </motion.button>
      )}

      <Dialog open={isAiDialogOpen} onOpenChange={setIsAiDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate SQL with AI</DialogTitle>
            <DialogDescription>
              Describe the query you want and AI will generate ClickHouse SQL for you.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            ref={inputRef}
            placeholder="e.g. Get top 10 most expensive traces from last 24 hours"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
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
