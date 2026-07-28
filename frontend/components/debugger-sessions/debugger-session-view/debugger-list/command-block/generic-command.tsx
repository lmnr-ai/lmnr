import { type CommandBlockContent } from "@/lib/actions/debugger-sessions";

import CommandOutput from "./command-output";
import { SectionLabel } from "./section-label";

// Expanded body for any command without a dedicated renderer: the invocation
// (prefer `raw`, fall back to `command` + `args`) followed by its output.
export default function GenericCommand({ command }: { command: CommandBlockContent }) {
  const input = command.raw ?? [command.command, ...(command.args ?? [])].join(" ");
  const failed = command.exitCode !== undefined && command.exitCode !== 0;

  return (
    <div className="flex flex-col border-t border-[rgba(232,232,232,0.1)]">
      <SectionLabel>command</SectionLabel>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs leading-5 text-primary-foreground">
        {input}
      </pre>
      <div className="border-t border-[rgba(232,232,232,0.1)]">
        <SectionLabel>stdout</SectionLabel>
        <CommandOutput output={command.output} failed={failed} />
      </div>
    </div>
  );
}
