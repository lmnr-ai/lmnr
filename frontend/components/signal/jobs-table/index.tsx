"use client";

import { type Row } from "@tanstack/react-table";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import React, { useEffect } from "react";
import useSWR from "swr";

import { type SignalJobRow, signalJobsColumns } from "@/components/signal/jobs-table/columns.tsx";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import { Button } from "@/components/ui/button.tsx";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store.tsx";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import { useFiltersContextProvider } from "@/components/ui/infinite-datatable/ui/datatable-filter/context.tsx";
import { Operator } from "@/lib/actions/common/operators.ts";
import { useToast } from "@/lib/hooks/use-toast.ts";
import { swrFetcher } from "@/lib/utils";

const JobsTableContent = () => {
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const searchParams = useParams<{ projectId: string }>();
  const pathName = usePathname();
  const signal = useSignalStoreContext((state) => state.signal);
  const { data, isLoading, error } = useSWR<{ items: SignalJobRow[] }>(
    `/api/projects/${params.projectId}/signals/${signal.id}/jobs`,
    swrFetcher
  );

  const jobs = data?.items || [];

  const { onChange } = useFiltersContextProvider();

  const handleRowClick = (row: Row<SignalJobRow>) => {
    onChange([{ value: row.id, operator: Operator.Eq, column: "job_id" }]);
    const params = new URLSearchParams(searchParams);
    params.set("tab", "runs");
    router.push(`${pathName}?${params.toString()}`);
  };

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
        <Button icon="plus">Create Job</Button>
      </Link>
      <InfiniteDataTable<SignalJobRow>
        className="w-full"
        columns={signalJobsColumns}
        data={jobs}
        getRowId={(job) => job.id}
        lockedColumns={["id"]}
        hasMore={false}
        isFetching={isLoading}
        isLoading={isLoading}
        fetchNextPage={() => {}}
        onRowClick={handleRowClick}
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
