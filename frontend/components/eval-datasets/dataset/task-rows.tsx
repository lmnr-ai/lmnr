import { ChevronRight } from "lucide-react";
import { useState } from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { type EvalDatasetTask, shortHash } from "@/lib/actions/eval-datasets/types";
import { cn } from "@/lib/utils";

interface TaskRowsProps {
  task: EvalDatasetTask;
  onOpenVersion: (task: string, hash: string) => void;
}

/** A task's latest version and, expanded, every version newest first. */
export default function TaskRows({ task, onOpenVersion }: TaskRowsProps) {
  const [expanded, setExpanded] = useState(false);
  const [latest] = task.versions;
  const shown = expanded ? task.versions : latest ? [latest] : [];

  return (
    <>
      {shown.map((version, i) => (
        <TableRow key={version.hash} className={cn("h-10 border-b last:border-b-0", i > 0 && "bg-muted/30")}>
          <TableCell className="px-3">
            {i === 0 && (
              <button
                type="button"
                className="flex items-center gap-1.5 font-medium"
                onClick={() => setExpanded((prev) => !prev)}
                title={expanded ? "Hide older versions" : "Show every version"}
              >
                <ChevronRight className={cn("size-3.5 text-muted-foreground", expanded && "rotate-90")} />
                {task.id}
              </button>
            )}
          </TableCell>
          <TableCell className="px-3">
            <span className="font-mono text-xs" title={version.hash}>
              {shortHash(version.hash)}
            </span>
            {i === 0 && <span className="ml-2 text-xs text-muted-foreground">latest</span>}
          </TableCell>
          <TableCell className="px-3 text-muted-foreground">
            <ClientTimestampFormatter timestamp={version.pushedAt} />
          </TableCell>
          <TableCell className="px-3 text-muted-foreground">{i === 0 ? task.versions.length : ""}</TableCell>
          <TableCell className="px-3 text-right">
            <Button variant="ghost" size="sm" onClick={() => onOpenVersion(task.id, version.hash)}>
              Files
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
