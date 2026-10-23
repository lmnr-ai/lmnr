"use client";

import SplitDiffView from "@/components/ui/diff/split-diff-view";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type AgentVersionItem } from "@/lib/actions/agents";

import ToolsDiff from "./tools-diff";
import ToolsList from "./tools-diff/tools-list";
import VersionModels from "./version-models";

interface VersionDetailsProps {
  version: AgentVersionItem;
  previous?: AgentVersionItem;
  promptChanged: boolean;
  toolsChanged: boolean;
}

function ContentBlock({ text }: { text: string }) {
  return (
    <ScrollArea className="rounded-md border bg-emphasis-0.5 max-h-96 [&>div]:max-h-96">
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

export default function VersionDetails({ version, previous, promptChanged, toolsChanged }: VersionDetailsProps) {
  return (
    <div className="flex flex-col gap-4 px-2 pt-2">
      <Field label="Models">
        <VersionModels models={version.models} />
      </Field>
      {previous ? (
        <>
          {promptChanged && (
            <Field label="System prompt">
              <div className="overflow-hidden rounded-md border bg-emphasis-0.5">
                <SplitDiffView
                  oldText={previous.systemPrompt}
                  newText={version.systemPrompt}
                  oldLabel={`v${previous.versionNumber}`}
                  newLabel={`v${version.versionNumber}`}
                />
              </div>
            </Field>
          )}
          {toolsChanged && (
            <Field label="Tools">
              <ToolsDiff
                oldText={previous.toolDefinitions}
                newText={version.toolDefinitions}
                oldLabel={`v${previous.versionNumber}`}
                newLabel={`v${version.versionNumber}`}
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
            <ToolsList text={version.toolDefinitions} />
          </Field>
        </>
      )}
    </div>
  );
}
