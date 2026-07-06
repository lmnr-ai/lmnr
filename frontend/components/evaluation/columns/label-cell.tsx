import { type CellContext, type ColumnDef } from "@tanstack/react-table";
import { Check, Loader2, Sparkles, X } from "lucide-react";

import { deriveStatus } from "@/components/evaluation/utils";
import { Tooltip, TooltipContent, TooltipPortal, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type EvalRow } from "@/lib/evaluation/types";

export function LabelHeader() {
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-1">
            <Sparkles className="size-3" />
            Label
          </span>
        </TooltipTrigger>
        {/* Portaled — the header cell clips overflow, so an inline tooltip gets cut off. */}
        <TooltipPortal>
          <TooltipContent side="bottom" className="max-w-64 whitespace-normal break-words text-xs">
            This is an auto-extracted field chosen as the identifying characteristic of this row.
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Flatten a datapoint's `data` into a one-line preview snippet. */
export function dataPreview(data: unknown): string {
  if (data == null) return "";
  if (typeof data === "string") return data.replace(/\s+/g, " ").trim();
  try {
    return JSON.stringify(data)
      .replace(/[{}"[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return String(data);
  }
}

function StatusIcon({ row }: { row: EvalRow }) {
  const status = deriveStatus(row);
  if (status === "error") return <X className="size-3.5 shrink-0 text-destructive" />;
  if (status === "success") return <Check className="size-3.5 shrink-0 text-success" />;
  return <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />;
}

// The row's identity at a glance: status + index + extracted label. `label` is
// resolved in ClickHouse (see `labelPathToSql`) once the field path is known;
// until then (or when extraction found nothing) fall back to a data preview.
export function LabelCell({ row }: CellContext<EvalRow, unknown>) {
  const index = row.original["index"] as number | undefined;
  const label = (row.original["label"] as string | undefined) || dataPreview(row.original["data"]);
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <StatusIcon row={row.original} />
      {/* Fixed width so the label text after it stays aligned across rows. */}
      <span className="inline-block w-10 shrink-0 text-xs text-muted-foreground">#{index ?? "?"}</span>
      <span className="truncate">{label || "-"}</span>
    </span>
  );
}

/** `labelSql` (compiled from the extracted field path) makes `label` a real query column — untruncated, resolved server-side. */
export function createLabelColumnDef(labelSql?: string): ColumnDef<EvalRow> {
  return {
    id: "label",
    header: LabelHeader,
    accessorFn: (row) => row["label"] ?? null,
    cell: LabelCell,
    size: 260,
    enableSorting: false,
    meta: { dataType: "string", filterable: false, comparable: false, ...(labelSql && { sql: labelSql }) },
  };
}
