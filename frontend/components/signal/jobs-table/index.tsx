"use client";

import { History } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useEffect } from "react";
import useSWR from "swr";

import { type SignalJobRow, signalJobsColumns } from "@/components/signal/jobs-table/columns.tsx";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import { Button } from "@/components/ui/button.tsx";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store.tsx";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import { useToast } from "@/lib/hooks/use-toast.ts";
import { swrFetcher } from "@/lib/utils";

const JobsTableContent = () => {
  const { toast } = useToast();
  const params = useParams<{ projectId: string }>();

  const signal = useSignalStoreContext((state) => state.signal);
  const { data, isLoading, error } = useSWR<{ items: SignalJobRow[] }>(
    `/api/projects/${params.projectId}/signal-jobs?signalId=${signal.id}`,
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
    <>
      <Link className="w-fit" href={`/project/${params.projectId}/signals/${signal.id}/job`} passHref>
        <Button>
          <History className="mr-1 size-3.5" />
          Create Job
        </Button>
      </Link>
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
    </>
  );
};

export default function SignalJobsTable() {
  return (
    <DataTableStateProvider defaultColumnOrder={signalJobsColumns.map((c) => String(c.id))}>
      <JobsTableContent />
    </DataTableStateProvider>
  );
}
