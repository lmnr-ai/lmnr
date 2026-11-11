"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";

import { CLUSTER_VIEWS, RESOLVED_VIEW } from "@/components/signal-clusters/cluster-views";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import { cn } from "@/lib/utils";

export const useClusterView = () =>
  useQueryState("view", parseAsStringLiteral(CLUSTER_VIEWS.map((v) => v.value)).withDefault("active"));

/** Active | Resolved | Archived pills above the cluster list; exactly one is selected. */
export default function ClusterListControls({ activeCount }: { activeCount?: number }) {
  const [urlView, setView] = useClusterView();
  const resolvable = useSignalStoreContext((state) => state.signal.resolvingEnabled);
  const view = !resolvable && urlView === RESOLVED_VIEW ? "active" : urlView;
  const views = resolvable ? CLUSTER_VIEWS : CLUSTER_VIEWS.filter((v) => v.value !== RESOLVED_VIEW);
  return (
    <div role="radiogroup" aria-label="Clusters" className="flex items-center gap-1.5">
      {views.map((v) => (
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
          {v.value === "active" && activeCount !== undefined && (
            <span className="ml-1 text-muted-foreground">{activeCount > 99 ? "99+" : activeCount}</span>
          )}
        </button>
      ))}
    </div>
  );
}
