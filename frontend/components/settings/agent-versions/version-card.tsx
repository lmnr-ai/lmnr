"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import DiffView from "@/components/ui/diff";
import { prettyJson } from "@/components/ui/diff/diff";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type AgentVersionItem } from "@/lib/actions/agents";
import { cn, formatTimestamp } from "@/lib/utils";

import SideBySideDialog from "./side-by-side-dialog";
import ToolsDiff from "./tools-diff";
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

function Field({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-[22px] items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {action}
      </div>
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
          <span className="text-sm font-medium">Version {version.versionNumber}</span>
          {isLatest && <span className="text-xs font-medium text-primary">Latest</span>}
          <span className="text-xs text-muted-foreground">{formatTimestamp(version.createdAt)}</span>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5">
            {previous ? (
              changes.map((c) => (
                <Badge key={c} variant="outline" className="h-5 font-normal text-muted-foreground">
                  {c}
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">Initial version</span>
            )}
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-4 border-t p-3">
          <Field label="Models">
            <VersionModels models={version.models} />
          </Field>
          {previous ? (
            <>
              {promptChanged && (
                <Field
                  label="System prompt"
                  action={
                    <SideBySideDialog
                      title="System prompt"
                      oldLabel={`Version ${previous.versionNumber}`}
                      newLabel={`Version ${version.versionNumber}`}
                      oldText={previous.systemPrompt}
                      newText={version.systemPrompt}
                    />
                  }
                >
                  <DiffView oldText={previous.systemPrompt} newText={version.systemPrompt} />
                </Field>
              )}
              {toolsChanged && (
                <Field
                  label="Tools"
                  action={
                    <SideBySideDialog
                      title="Tools"
                      oldLabel={`Version ${previous.versionNumber}`}
                      newLabel={`Version ${version.versionNumber}`}
                      oldText={prettyJson(previous.toolDefinitions)}
                      newText={prettyJson(version.toolDefinitions)}
                    />
                  }
                >
                  <ToolsDiff oldText={previous.toolDefinitions} newText={version.toolDefinitions} />
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
