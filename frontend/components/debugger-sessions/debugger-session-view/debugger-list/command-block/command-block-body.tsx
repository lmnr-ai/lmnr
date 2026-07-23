import { type CommandBlockContent } from "@/lib/actions/debugger-sessions";

import CommandOutput from "./command-output";
import GenericCommand from "./generic-command";
import SqlQueryCommand from "./sql-query-command";

// Expanded body of a command block: the subcommand-specific rendering (stdout
// included) followed by a separate stderr section when the command produced
// any. stdout and stderr are kept as distinct fields — stderr carries the fatal
// error on failure (and benign diagnostics otherwise), so it renders red only
// when the command actually failed; the header icon is the primary signal.
export default function CommandBlockBody({ command }: { command: CommandBlockContent }) {
  const failed = command.exitCode !== undefined && command.exitCode !== 0;

  return (
    <>
      {command.command === "sql query" ? <SqlQueryCommand command={command} /> : <GenericCommand command={command} />}
      {command.stderr !== undefined && command.stderr.length > 0 && (
        <div className="border-t border-[rgba(232,232,232,0.1)]">
          <div className="px-3 pt-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">stderr</div>
          <CommandOutput output={command.stderr} failed={failed} />
        </div>
      )}
    </>
  );
}
