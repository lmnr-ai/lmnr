"use client";

import { useEffect, useMemo } from "react";
import useSWR from "swr";

import {
  getTraceAnalysisJobColumns,
  type TraceAnalysisJobRow,
} from "@/components/events/trace-analysis-jobs-table/columns.tsx";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import { useToast } from "@/lib/hooks/use-toast.ts";
import { swrFetcher } from "@/lib/utils";

interface TraceAnalysisJobsTableProps {
  projectId: string;
  eventDefinitionId: string;
}

const PureTraceAnalysisJobsTable = ({ projectId, eventDefinitionId }: TraceAnalysisJobsTableProps) => {
  const { toast } = useToast();
  const columns = useMemo(() => getTraceAnalysisJobColumns(), []);

  const { data, isLoading, error } = useSWR<{ jobs: TraceAnalysisJobRow[] }>(
    `/api/projects/${projectId}/trace-analysis-jobs?eventDefinitionId=${eventDefinitionId}`,
    swrFetcher
  );

  const jobs = data?.jobs || [];

  useEffect(() => {
    if (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to load trace analysis jobs. Please try again.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  return (
    <InfiniteDataTable<TraceAnalysisJobRow>
      className="w-full"
      columns={columns}
      data={jobs}
      getRowId={(job) => job.id}
      lockedColumns={["id"]}
      hasMore={false}
      isFetching={false}
      isLoading={isLoading}
      fetchNextPage={() => {}}
    >
      <div className="flex flex-1 w-full space-x-2">
        <ColumnsMenu
          columnLabels={columns.map((column) => ({
            id: column.id!,
            label: typeof column.header === "string" ? column.header : column.id!,
          }))}
          lockedColumns={["id"]}
        />
      </div>
    </InfiniteDataTable>
  );
};

export default function TraceAnalysisJobsTable({ projectId, eventDefinitionId }: TraceAnalysisJobsTableProps) {
  return <PureTraceAnalysisJobsTable projectId={projectId} eventDefinitionId={eventDefinitionId} />;
}
