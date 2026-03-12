import { SquareArrowOutUpRight } from "lucide-react";

import { TableCell, TableRow } from "../ui/table";

const EmptyRow = () => (
  <TableRow className="flex">
    <TableCell className="text-center p-4 rounded-b w-full h-auto">
      <div className="flex flex-1 justify-center">
        <div className="flex flex-col gap-2 items-center max-w-md">
          <h3 className="text-base font-medium text-secondary-foreground">No signals yet</h3>
          <p className="text-sm text-muted-foreground text-center">
            Signals let you track outcomes, behaviors, and failures in your traces using LLM-based evaluation. Click +
            Signal above to get started.
          </p>
          <a
            href="https://docs.laminar.sh/signals"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Learn more
            <SquareArrowOutUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </TableCell>
  </TableRow>
);

export default EmptyRow;
