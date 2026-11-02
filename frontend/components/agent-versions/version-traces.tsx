"use client";

import { useRef } from "react";
import useSWR from "swr";

import { Skeleton } from "@/components/ui/skeleton";
import { type AgentVersionItem, type AgentVersionTracesPoint } from "@/lib/actions/agents";
import { swrFetcher } from "@/lib/utils";

import { useTracesRangeQuery } from "./use-traces-range-query";
import VersionTracesChart from "./version-traces-chart";

interface VersionTracesProps {
  projectId: string;
  agentId: string;
  versions: AgentVersionItem[];
}

export default function VersionTraces({ projectId, agentId, versions }: VersionTracesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rangeQuery = useTracesRangeQuery(containerRef);
  const { data } = useSWR<{ items: AgentVersionTracesPoint[] }>(
    `/api/projects/${projectId}/agents/${agentId}/traces-stats?${rangeQuery}`,
    swrFetcher,
    { keepPreviousData: true }
  );

  return (
    <div ref={containerRef}>
      {data ? (
        <VersionTracesChart agentId={agentId} versions={versions} data={data.items} />
      ) : (
        <Skeleton className="h-[248px] w-full" />
      )}
    </div>
  );
}
