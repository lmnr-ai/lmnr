import { type CommandBlockContent } from "@/lib/actions/debugger-sessions";

import GenericCommand from "./generic-command";
import SqlQueryCommand from "./sql-query-command";

// Expanded body of a command block: dispatch on the CLI subcommand. Unknown
// subcommands fall through to the generic input + output renderer.
export default function CommandBlockBody({ command }: { command: CommandBlockContent }) {
  switch (command.command) {
    case "sql query":
      return <SqlQueryCommand command={command} />;
    default:
      return <GenericCommand command={command} />;
  }
}
