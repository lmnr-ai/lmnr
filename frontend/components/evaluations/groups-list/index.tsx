"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";
import useSWR from "swr";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, swrFetcher } from "@/lib/utils";

import RunCountBadge from "./run-count-badge";
import type { EvaluationGroup } from "./types";

export default function GroupsList() {
  const { projectId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const { data: groups, isLoading } = useSWR<EvaluationGroup[]>(
    `/api/projects/${projectId}/evaluation-groups`,
    swrFetcher
  );

  const groupId = searchParams.get("groupId");

  useEffect(() => {
    if (groups && groups.length > 0 && !groupId) {
      router.replace(`/project/${projectId}/evaluations?groupId=${groups[0].groupId}`);
    }
  }, [groups, groupId, router, projectId]);

  const onSelect = useCallback(
    (selectedGroupId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("groupId", selectedGroupId);
      router.push(`/project/${projectId}/evaluations?${params.toString()}`);
    },
    [projectId, router, searchParams]
  );

  return (
    <div className="flex w-72 shrink-0 flex-col gap-2 overflow-hidden">
      <span className="text-xs font-medium text-muted-foreground">Groups ({groups?.length ?? 0})</span>
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
                      isSelected ? "bg-muted/50" : "hover:bg-muted/60"
                    )}
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span
                        className={cn(
                          "truncate text-sm font-medium",
                          isSelected ? "text-primary-foreground" : "text-muted-foreground"
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
