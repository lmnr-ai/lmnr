import { type ReactNode } from "react";

import { TableCell, TableRow } from "@/components/ui/table";

/** A full-width table row for an empty, no-match or error state. */
export default function MessageRow({ children }: { children: ReactNode }) {
  return (
    <TableRow className="flex">
      <TableCell className="h-auto w-full p-4 text-center text-sm text-muted-foreground">{children}</TableCell>
    </TableRow>
  );
}
