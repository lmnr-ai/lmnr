"use client";

import { useEffect } from "react";
import useSWR from "swr";

import { type SignalJobRow, signalJobsColumns } from "@/components/signal/jobs-table/columns.tsx";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store.tsx";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import { useToast } from "@/lib/hooks/use-toast.ts";
import { swrFetcher } from "@/lib/utils";

interface SignalJobsTableProps {
  projectId: string;
  eventDefinitionId: string;
}

const JobsTableContent = ({ projectId, eventDefinitionId }: SignalJobsTableProps) => {
  const { toast } = useToast();

  const { data, isLoading, error } = useSWR<{ items: SignalJobRow[] }>(
    `/api/projects/${projectId}/trace-analysis-jobs?eventDefinitionId=${eventDefinitionId}`,
    swrFetcher
  );

  const jobs = data?.items || [];

  useEffect(() => {
    if (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to load trace analysis jobs. Please try again.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  return (
    <InfiniteDataTable<SignalJobRow>
      className="w-full"
      columns={signalJobsColumns}
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
          columnLabels={signalJobsColumns.map((column) => ({
            id: column.id!,
            label: typeof column.header === "string" ? column.header : column.id!,
          }))}
          lockedColumns={["id"]}
        />
      </div>
    </InfiniteDataTable>
  );
};

export default function SignalJobsTable({ projectId, eventDefinitionId }: SignalJobsTableProps) {
  return (
    <DataTableStateProvider defaultColumnOrder={signalJobsColumns.map((c) => String(c.id))}>
      <JobsTableContent projectId={projectId} eventDefinitionId={eventDefinitionId} />
    </DataTableStateProvider>
  );
}
