"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type AgentVersionItem } from "@/lib/actions/agents";
import { cn, formatTimestamp } from "@/lib/utils";

import { prettyJson } from "./diff";
import DiffView from "./diff-view";

interface VersionCardProps {
  version: AgentVersionItem;
  previous?: AgentVersionItem;
  versionNumber: number;
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

export default function VersionCard({ version, previous, versionNumber, isLatest }: VersionCardProps) {
  const [open, setOpen] = useState(isLatest);

  const modelChanged = previous ? version.model !== previous.model : false;
  const promptChanged = previous ? version.systemPrompt !== previous.systemPrompt : false;
  const toolsChanged = previous ? version.toolDefinitions !== previous.toolDefinitions : false;

  const changes = [modelChanged && "Model", promptChanged && "System prompt", toolsChanged && "Tools"].filter(
    Boolean
  ) as string[];

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
          <span className="text-sm font-medium">Version {versionNumber}</span>
          {isLatest && <span className="text-xs font-medium text-primary">Latest</span>}
          <span className="text-xs text-muted-foreground">{formatTimestamp(version.createdAt)}</span>
          <div className="flex-1" />
          <span className="font-mono text-xs text-muted-foreground">{version.model}</span>
          <div className="flex items-center gap-1.5">
            {previous ? (
              changes.length > 0 ? (
                <>
                  <span className="text-xs text-muted-foreground">Changed</span>
                  {changes.map((c) => (
                    <Badge key={c} variant="outline" className="h-5 font-normal text-muted-foreground">
                      {c}
                    </Badge>
                  ))}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">No changes</span>
              )
            ) : (
              <span className="text-xs text-muted-foreground">Initial version</span>
            )}
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-4 border-t p-3">
          {previous ? (
            <>
              {modelChanged && (
                <Field label="Model">
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive line-through">
                      {previous.model}
                    </span>
                    <span className="text-muted-foreground">{"\u2192"}</span>
                    <span className="rounded bg-success/10 px-1.5 py-0.5 text-success">{version.model}</span>
                  </div>
                </Field>
              )}
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
              {changes.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  This version is identical to the previous one in model, system prompt, and tools.
                </span>
              )}
            </>
          ) : (
            <>
              <Field label="Model">
                <span className="font-mono text-xs text-muted-foreground">{version.model}</span>
              </Field>
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
