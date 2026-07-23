"use client";

import { useParams } from "next/navigation";
import { useQueryState } from "nuqs";
import { useCallback, useEffect } from "react";
import useSWR from "swr";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, swrFetcher } from "@/lib/utils";

import RunCountBadge from "./run-count-badge";
import type { EvaluationGroup } from "./types";

export default function GroupsList() {
  const { projectId } = useParams();

  const { data: groups, isLoading } = useSWR<EvaluationGroup[]>(
    `/api/projects/${projectId}/evaluation-groups`,
    swrFetcher
  );

  // Canonical group selection — nuqs merges into the URL without clobbering the
  // other query params (filters/search/view state).
  const [groupId, setGroupId] = useQueryState("groupId");

  useEffect(() => {
    if (groups && groups.length > 0 && !groupId) {
      // Default to the first group; replace (not push) so it isn't a history entry.
      setGroupId(groups[0].groupId, { history: "replace" });
    }
  }, [groups, groupId, setGroupId]);

  const onSelect = useCallback(
    (selectedGroupId: string) => {
      setGroupId(selectedGroupId, { history: "push" });
    },
    [setGroupId]
  );

  return (
    <div className="flex h-full w-full flex-col gap-2 overflow-hidden">
      <div className="flex-1 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex flex-col gap-1.5 py-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !groups || groups.length === 0 ? (
          <div className="px-2 py-4 text-xs text-muted-foreground">No evaluation groups yet.</div>
        ) : (
          <ul className="flex flex-col gap-px py-1">
            {groups.map((g) => {
              const isSelected = g.groupId === groupId;
              return (
                <li key={g.groupId}>
                  <button
                    type="button"
                    onClick={() => onSelect(g.groupId)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                      // Match the settings sidebar nav hover/active colors.
                      isSelected ? "bg-surface-600" : "hover:bg-surface-700 active:bg-surface-600"
                    )}
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span
                        className={cn(
                          "truncate text-sm font-medium",
                          isSelected ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {g.groupId}
                      </span>
                      <ClientTimestampFormatter
                        className="text-[11px] text-muted-foreground"
                        timestamp={g.lastEvaluationCreatedAt}
                      />
                    </div>
                    <RunCountBadge count={g.runCount} selected={isSelected} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
