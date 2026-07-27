"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";
import { type CommandBlockContent } from "@/lib/actions/debugger-sessions";

import CommandOutput from "./command-output";
import GenericCommand from "./generic-command";
import { SectionLabel } from "./section-label";

// Defer the CodeMirror SQL bundle (schema + autocomplete payload) to first
// expand of an sql-query block — same pattern as pdf-renderer.tsx.
const SQLEditor = dynamic(() => import("@/components/sql/sql-editor.tsx").then((mod) => mod.default), {
  ssr: false,
  loading: () => <Skeleton className="m-2 h-16" />,
});

// Expanded `sql query` command: the SQL payload (first positional arg) rendered
// read-only in the shared CodeMirror SQL editor, then the query result below.
// No payload → fall back to the generic renderer rather than an empty editor.
export default function SqlQueryCommand({ command }: { command: CommandBlockContent }) {
  const sqlText = command.args?.[0];
  if (!sqlText) return <GenericCommand command={command} />;

  const failed = command.exitCode !== undefined && command.exitCode !== 0;

  return (
    <div className="flex flex-col border-t border-[rgba(232,232,232,0.1)]">
      <SectionLabel>query</SectionLabel>
      <div className="max-h-80 overflow-auto">
        <SQLEditor value={sqlText} editable={false} className="text-xs" />
      </div>
      <div className="border-t border-[rgba(232,232,232,0.1)]">
        <SectionLabel>stdout</SectionLabel>
        <CommandOutput output={command.output} failed={failed} />
      </div>
    </div>
  );
}
