"use client";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import SignalVersion from "@/components/signal/signal-version";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import DiffView from "@/components/ui/diff";
import { ScrollArea } from "@/components/ui/scroll-area";

import { type ChangelogEntry } from "./changelog";

const snapshot = (definition: Record<string, unknown>): string => JSON.stringify(definition, null, 2);

export default function VersionRow({ entry }: { entry: ChangelogEntry }) {
  return (
    <AccordionItem value={String(entry.version)} id={`signal-version-${entry.version}`}>
      <AccordionTrigger className="py-3 hover:no-underline">
        <span className="flex flex-1 items-center gap-3 min-w-0 pr-2">
          <SignalVersion version={entry.version} />
          <span className="text-sm text-muted-foreground truncate">{entry.summary}</span>
          <ClientTimestampFormatter timestamp={entry.createdAt} className="ml-auto shrink-0 text-xs" />
        </span>
      </AccordionTrigger>
      <AccordionContent>
        {entry.previous ? (
          <DiffView oldText={snapshot(entry.previous)} newText={snapshot(entry.definition)} />
        ) : (
          <ScrollArea className="rounded-md border bg-muted/30 max-h-96 [&>div]:max-h-96">
            <pre className="px-3 py-1 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">
              {snapshot(entry.definition)}
            </pre>
          </ScrollArea>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}
