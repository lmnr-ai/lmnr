"use client";

import { useState } from "react";

import { CopyButton } from "@/components/ui/copy-button";

export function PromptCard({ title, subtitle, prompt }: { title: string; subtitle: string; prompt: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex flex-col">
      <div className="group rounded-lg border bg-background p-4 transition-colors hover:bg-muted/30">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-sm font-medium">{title}</span>
            <span className="text-xs text-muted-foreground">{subtitle}</span>
          </div>
          <CopyButton text={prompt} variant="ghost" size="icon" className="shrink-0 text-muted-foreground" />
        </div>
      </div>
      {expanded && (
        <div className="max-h-64 overflow-auto rounded-b-md border border-t-0 bg-background p-3">
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono">{prompt}</pre>
        </div>
      )}
      <button
        onClick={() => setExpanded(!expanded)}
        className="self-start text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer mt-1 px-1"
      >
        {expanded ? "Hide prompt" : "View prompt"}
      </button>
    </div>
  );
}
