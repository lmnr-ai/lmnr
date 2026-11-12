"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";

import { CLUSTER_VIEWS, type ClusterView } from "@/components/signal-clusters/cluster-views";
import { cn } from "@/lib/utils";

export const useClusterView = () =>
  useQueryState("view", parseAsStringLiteral(CLUSTER_VIEWS.map((v) => v.value)).withDefault("active"));

/** Active | Resolved | Archived pills above the cluster list; exactly one is selected. */
export default function ClusterListControls({ counts }: { counts?: Record<ClusterView, number> }) {
  const [view, setView] = useClusterView();
  return (
    <div role="radiogroup" aria-label="Clusters" className="flex items-center gap-1.5">
      {CLUSTER_VIEWS.map((v) => (
        <button
          key={v.value}
          type="button"
          role="radio"
          aria-checked={view === v.value}
          onClick={() => void setView(v.value)}
          className={cn(
            "h-6 rounded-full border px-2.5 text-xs transition-colors",
            view === v.value
              ? "border-emphasis-4 bg-emphasis-2 text-foreground"
              : "text-secondary-foreground hover:overlay-hover"
          )}
        >
          {v.label}
          {counts && (
            <span className="ml-1 text-muted-foreground">{counts[v.value] > 99 ? "99+" : counts[v.value]}</span>
          )}
        </button>
      ))}
    </div>
  );
}
