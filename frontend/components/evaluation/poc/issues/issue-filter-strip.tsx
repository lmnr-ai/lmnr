"use client";

import { X } from "lucide-react";

import { type AssignedIssueCluster } from "@/components/evaluation/poc/issues/mock-issues";
import { Button } from "@/components/ui/button";

interface IssueFilterStripProps {
  cluster: AssignedIssueCluster;
  totalRows: number;
  onClear: () => void;
}

/**
 * Shared active-filter context strip, shown above the table whenever a
 * cluster is selected, regardless of which top mode picked it. This is the
 * one place the full 2-sentence description is always readable.
 */
export default function IssueFilterStrip({ cluster, totalRows, onClear }: IssueFilterStripProps) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border bg-secondary px-3 py-2.5">
      <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: cluster.color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          {cluster.title}
          <span className="text-xs font-normal text-muted-foreground">
            {cluster.indices.length} of {totalRows} datapoints
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{cluster.description}</p>
      </div>
      <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={onClear} title="Clear filter">
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
