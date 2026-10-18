"use client";

import { ChevronRight, FileDiff } from "lucide-react";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import DiffView from "@/components/ui/diff";
import { prettyJson } from "@/components/ui/diff/diff";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type AgentVersionItem } from "@/lib/actions/agents";
import { cn, formatTimestamp } from "@/lib/utils";

import VersionModels from "./version-models";

interface VersionCardProps {
  version: AgentVersionItem;
  previous?: AgentVersionItem;
  isLatest: boolean;
}

function ContentBlock({ text }: { text: string }) {
  return (
    <ScrollArea className="rounded-md border bg-muted/30 max-h-96 [&>div]:max-h-96">
      <div className="px-3 py-1 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">
        {text || "\u2014"}
      </div>
    </ScrollArea>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export default function VersionCard({ version, previous, isLatest }: VersionCardProps) {
  const [open, setOpen] = useState(isLatest);

  const promptChanged = previous ? version.systemPromptVersionHash !== previous.systemPromptVersionHash : false;
  const toolsChanged = previous ? version.toolDefinitionsHash !== previous.toolDefinitionsHash : false;
  const changes = [promptChanged && "System prompt", toolsChanged && "Tools"].filter(Boolean) as string[];

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border rounded-md">
      <CollapsibleTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
        >
          <ChevronRight
            className={cn("size-3.5 flex-shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          />
          <span className="text-sm font-medium flex-shrink-0">Version {version.versionNumber}</span>
          {isLatest && <span className="text-xs font-medium text-primary flex-shrink-0">Latest</span>}
          <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            {previous
              ? changes.length > 0 && (
                  <>
                    <FileDiff className="size-3 flex-shrink-0" />
                    <span className="truncate">Changed: {changes.join(", ")}</span>
                  </>
                )
              : "Initial version"}
          </span>
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground flex-shrink-0">{formatTimestamp(version.createdAt)}</span>
          <VersionModels models={version.models} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-4 border-t p-3">
          {previous ? (
            <>
              {promptChanged && (
                <Field label="System prompt">
                  <DiffView oldText={previous.systemPrompt} newText={version.systemPrompt} />
                </Field>
              )}
              {toolsChanged && (
                <Field label="Tools">
                  <DiffView
                    oldText={prettyJson(previous.toolDefinitions)}
                    newText={prettyJson(version.toolDefinitions)}
                  />
                </Field>
              )}
            </>
          ) : (
            <>
              <Field label="System prompt">
                <ContentBlock text={version.systemPrompt} />
              </Field>
              <Field label="Tools">
                <ContentBlock text={prettyJson(version.toolDefinitions)} />
              </Field>
            </>
          )}
          <div className="flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
            <span className="font-medium">Version ID</span>
            <span className="font-mono break-all">{version.versionHash}</span>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
