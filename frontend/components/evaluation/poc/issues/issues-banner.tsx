"use client";

import { useState } from "react";

import IssueCards from "@/components/evaluation/poc/issues/issue-cards";
import { type AssignedIssueCluster } from "@/components/evaluation/poc/issues/mock-issues";
import { Button } from "@/components/ui/button";

interface IssuesBannerProps {
  clusters: AssignedIssueCluster[];
  selectedId: string | null;
  onToggle: (id: string) => void;
}

/** One-line summary that expands to the cards row on demand — cheapest default height. */
export default function IssuesBanner({ clusters, selectedId, onToggle }: IssuesBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const worst = clusters[0];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          {clusters.length} recurring issues
          {worst && (
            <>
              {" "}
              · worst: <span className="font-medium text-foreground">{worst.title}</span> ({worst.indices.length}{" "}
              datapoints)
            </>
          )}
        </span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Hide" : "Show"}
        </Button>
      </div>
      {expanded && <IssueCards clusters={clusters} selectedId={selectedId} onToggle={onToggle} />}
    </div>
  );
}
