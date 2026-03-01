"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";

export function PromptCard({ title, subtitle, prompt }: { title: string; subtitle?: string; prompt: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex flex-col">
      <div className="group rounded-lg border bg-background p-4 transition-colors hover:bg-muted/30">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-sm font-medium">{title}</span>
            {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
          </div>
          <div className="flex items-center shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setExpanded(!expanded)}
              className="text-muted-foreground"
            >
              {expanded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
            <CopyButton text={prompt} variant="ghost" size="icon" className="text-muted-foreground" />
          </div>
        </div>
      </div>
      {expanded && (
        <div className="max-h-64 overflow-auto rounded-b-md border border-t-0 bg-background p-3">
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono">{prompt}</pre>
        </div>
      )}
    </div>
  );
}
