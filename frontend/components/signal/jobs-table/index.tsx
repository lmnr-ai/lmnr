"use client";

import { type Row } from "@tanstack/react-table";
import { isEqual } from "lodash";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo } from "react";
import useSWR from "swr";

import { type SignalJobRow, signalJobsColumns, signalJobsFilters } from "@/components/signal/jobs-table/columns.tsx";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import { Button } from "@/components/ui/button.tsx";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store.tsx";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import FilterPopover, { FilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter/ui";
import { type Filter } from "@/lib/actions/common/filters.ts";
import { Operator } from "@/lib/actions/common/operators.ts";
import { useToast } from "@/lib/hooks/use-toast.ts";
import { swrFetcher } from "@/lib/utils";

const JobsTableContent = () => {
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const searchParams = useParams<{ projectId: string }>();
  const pathName = usePathname();
  const { signal, setRunsFilters, jobsFilters, setJobsFilters } = useSignalStoreContext((state) => ({
    signal: state.signal,
    setRunsFilters: state.setRunsFilters,
    jobsFilters: state.jobsFilters,
    setJobsFilters: state.setJobsFilters,
  }));

  const apiUrl = useMemo(() => {
    const urlParams = new URLSearchParams();
    jobsFilters.forEach((f) => urlParams.append("filter", JSON.stringify(f)));
    const queryString = urlParams.toString();
    return `/api/projects/${params.projectId}/signals/${signal.id}/jobs${queryString ? `?${queryString}` : ""}`;
  }, [params.projectId, signal.id, jobsFilters]);

  const { data, isLoading, error } = useSWR<{ items: SignalJobRow[] }>(apiUrl, swrFetcher);

  const jobs = data?.items || [];

  const handleAddFilter = useCallback(
    (filter: Filter) => {
      setJobsFilters((prev) => [...prev, filter]);
    },
    [setJobsFilters]
  );

  const handleRemoveFilter = useCallback(
    (filter: Filter) => {
      setJobsFilters((prev) => prev.filter((f) => !isEqual(f, filter)));
    },
    [setJobsFilters]
  );

  const handleRowClick = (row: Row<SignalJobRow>) => {
    setRunsFilters([{ value: row.id, operator: Operator.Eq, column: "job_id" }]);
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
          <FilterPopover columns={signalJobsFilters} filters={jobsFilters} onAddFilter={handleAddFilter} />
          <ColumnsMenu
            columnLabels={signalJobsColumns.map((column) => ({
              id: column.id!,
              label: typeof column.header === "string" ? column.header : column.id!,
            }))}
            lockedColumns={["id"]}
          />
        </div>
        <FilterList className="py-[3px] text-xs px-1" filters={jobsFilters} onRemoveFilter={handleRemoveFilter} />
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
