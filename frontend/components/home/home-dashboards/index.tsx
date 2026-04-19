"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";

import { type DashboardChart } from "@/components/dashboard/types";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

import HomeDashboardCard from "./home-dashboard-card";

export default function HomeDashboards() {
  const { projectId } = useParams();
  const { toast } = useToast();
  const {
    data = [],
    isLoading,
    error,
  } = useSWR<DashboardChart[]>(`/api/projects/${projectId}/dashboard-charts`, swrFetcher);

  // Track unpinned IDs. All dashboards are pinned by default.
  const [unpinnedIds, setUnpinnedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (error) {
      toast({ variant: "destructive", title: "Failed to load dashboards" });
    }
  }, [error, toast]);

  const handleTogglePin = useCallback((id: string) => {
    setUnpinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 items-start w-full">
        <p className="text-xs text-secondary-foreground">Dashboards</p>
        <div className="grid grid-cols-3 gap-4 w-full">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="w-full h-[269px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col gap-2 items-start w-full">
        <p className="text-xs text-secondary-foreground">Dashboards</p>
        <p className="text-sm text-muted-foreground">No dashboards yet. Create one from the Dashboards page.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 items-start w-full">
      <p className="text-xs text-secondary-foreground">Dashboards</p>
      <div className="grid grid-cols-3 gap-4 w-full">
        {data.map((chart) => (
          <HomeDashboardCard
            key={chart.id}
            chart={chart}
            isPinned={!unpinnedIds.has(chart.id)}
            onTogglePin={() => handleTogglePin(chart.id)}
          />
        ))}
      </div>
    </div>
  );
}
