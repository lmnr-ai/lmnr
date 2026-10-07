import { DatabaseSearch, MessageCircle, SquareTerminal } from "lucide-react";
import { type ReactElement } from "react";

import { type CommandBlockContent } from "@/lib/actions/debugger-sessions";

/**
 * Per-tracked-command icon. `ask` reads as a chat turn, `sql query` as a query
 * over a database. Anything else falls back to the generic terminal glyph.
 * SquareTerminal is reserved for the command-GROUP header (the "CLI commands (N)"
 * identity), so individual command rows never repeat it for a known command.
 * Returns rendered JSX (not a component) so callers don't assign a component to a
 * variable during render (react-hooks/static-components).
 */
export function commandIcon(command: CommandBlockContent, className?: string): ReactElement {
  switch (command.command) {
    case "ask":
      return <MessageCircle className={className} />;
    case "sql query":
      return <DatabaseSearch className={className} />;
    default:
      return <SquareTerminal className={className} />;
  }
}
