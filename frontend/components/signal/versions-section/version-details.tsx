"use client";

import SplitDiffView from "@/components/ui/diff/split-diff-view";
import { ScrollArea } from "@/components/ui/scroll-area";

import { type ChangelogEntry } from "./changelog";

function ContentBlock({ text }: { text: string }) {
  return (
    <ScrollArea className="max-h-96 rounded-md border bg-emphasis-0.5 [&>div]:max-h-96">
      <div className="px-3 py-1 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-muted-foreground">
        {text || "—"}
      </div>
    </ScrollArea>
  );
}

/** Each changed field as a split diff against the previous version; v1 shows every field as it was created. */
export default function VersionDetails({ entry }: { entry: ChangelogEntry }) {
  return (
    <div className="flex flex-col gap-4 px-2 pt-2">
      {entry.fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1.5">
          <span className="flex min-h-[22px] items-center text-xs font-medium text-muted-foreground">
            {field.label}
          </span>
          {field.before === undefined ? (
            <ContentBlock text={field.after} />
          ) : (
            <div className="overflow-hidden rounded-md border bg-emphasis-0.5">
              <SplitDiffView
                oldText={field.before}
                newText={field.after}
                oldLabel={`v${entry.version - 1}`}
                newLabel={`v${entry.version}`}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
