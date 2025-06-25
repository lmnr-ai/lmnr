"use client";

import { ColumnDef } from "@tanstack/react-table";
import { flow } from "lodash";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import React, { useCallback, useMemo, useState } from "react";
import useSWR from "swr";

import ProgressionChart from "@/components/evaluations/progression-chart";
import SearchEvaluationsInput from "@/components/evaluations/search-evaluations-input";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/datatable-filter";
import { ColumnFilter } from "@/components/ui/datatable-filter/utils";
import DeleteSelectedRows from "@/components/ui/DeleteSelectedRows";
import { useUserContext } from "@/contexts/user-context";
import { AggregationFunction } from "@/lib/clickhouse/utils";
import { Evaluation } from "@/lib/evaluation/types";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { useToast } from "@/lib/hooks/use-toast";
import { PaginatedResponse } from "@/lib/types";
import { swrFetcher } from "@/lib/utils";

import ClientTimestampFormatter from "../client-timestamp-formatter";
import { DataTable } from "../ui/datatable";
import Header from "../ui/header";
import Mono from "../ui/mono";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../ui/resizable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import EvaluationsGroupsBar from "./evaluations-groups-bar";

const columns: ColumnDef<Evaluation>[] = [
  {
    accessorKey: "id",
    cell: (row) => <Mono>{String(row.getValue())}</Mono>,
    header: "ID",
    size: 300,
  },
  {
    accessorKey: "name",
    header: "Name",
    size: 300,
  },
  {
    accessorKey: "dataPointsCount",
    header: "Datapoints",
  },
  {
    accessorKey: "metadata",
    header: "Metadata",
    accessorFn: flow(
      (row: Evaluation) => row.metadata,
      (metadata) => (metadata ? JSON.stringify(metadata) : "-")
    ),
  },
  {
    header: "Created at",
    accessorKey: "createdAt",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
  },
];

const filters: ColumnFilter[] = [
  {
    name: "ID",
    key: "id",
    dataType: "string",
  },
  {
    name: "Name",
    key: "name",
    dataType: "string",
  },
  {
    name: "Datapoints Count",
    key: "dataPointsCount",
    dataType: "number",
  },
  {
    name: "Metadata",
    key: "metadata",
    dataType: "json",
  },
];

enum AggregationOptions {
  AVG = "Average",
  SUM = "Sum",
  MIN = "Minimum",
  MAX = "Maximum",
  MEDIAN = "Median",
  p90 = "p90",
  p95 = "p95",
  p99 = "p99",
}

export default function Evaluations() {
  const params = useParams();
  const pathName = usePathname();
  const { push } = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const posthog = usePostHog();
  const { email } = useUserContext();
  const groupId = searchParams.get("groupId");
  const filter = searchParams.getAll("filter");
  const search = searchParams.get("search");

  const page = useMemo<{ number: number; size: number }>(() => {
    const size = searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : 25;
    return {
      number: searchParams.get("pageNumber") ? Number(searchParams.get("pageNumber")) : 0,
      size,
    };
  }, [searchParams]);

  const evaluationsParams = useMemo(() => {
    const sp = new URLSearchParams();
    if (groupId) {
      sp.set("groupId", groupId);
    }

    if (search && search.trim() !== "") {
      sp.set("search", search);
    }

    filter.forEach((f) => sp.append("filter", f));

    sp.append("pageNumber", String(page.number));
    sp.append("pageSize", String(page.size));

    return sp;
  }, [filter, groupId, page.number, page.size, search]);

  const { data, mutate } = useSWR<PaginatedResponse<Evaluation & { dataPointsCount: 0 }>>(
    `/api/projects/${params?.projectId}/evaluations?${evaluationsParams.toString()}`,
    swrFetcher
  );

  const [aggregationFunction, setAggregationFunction] = useState<AggregationFunction>("AVG");

  const handlePageChange = useCallback(
    (pageNumber: number, pageSize: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("pageNumber", pageNumber.toString());
      params.set("pageSize", pageSize.toString());
      push(`${pathName}?${params}`);
    },
    [pathName, push, searchParams]
  );

  const handleDeleteEvaluations = async (selectedRowIds: string[]) => {
    try {
      const sp = new URLSearchParams(selectedRowIds.map((id) => ["id", id]));

      const response = await fetch(`/api/projects/${params?.projectId}/evaluations?${sp.toString()}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        await mutate();

        toast({
          title: "Evaluations deleted",
          description: `Successfully deleted ${selectedRowIds.length} evaluation(s).`,
        });
      } else {
        throw new Error("Failed to delete evaluations");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete evaluations. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isFeatureEnabled(Feature.POSTHOG)) {
    posthog.identify(email);
  }

  return (
    <div className="flex flex-col flex-1">
      <Header path="evaluations" />
      <div className="flex flex-1">
        <EvaluationsGroupsBar />
        <div className="flex flex-col flex-1 overflow-auto">
          <div className="flex gap-4 pt-4 px-4 items-center">
            <div className="text-primary-foreground text-xl font-medium">{searchParams.get("groupId")}</div>
            <Select
              value={aggregationFunction}
              onValueChange={(value) => setAggregationFunction(value as AggregationFunction)}
            >
              <SelectTrigger className="w-fit">
                <SelectValue placeholder="Aggregate" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(AggregationOptions) as (keyof typeof AggregationOptions)[]).map((option) => (
                  <SelectItem key={option} value={option}>
                    {AggregationOptions[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel className="px-2 flex-grow" minSize={20} defaultSize={20}>
              <ProgressionChart
                evaluations={(data?.items || []).map(({ id, name }) => ({ id, name }))}
                className="h-full px-2 py-4"
                aggregationFunction={aggregationFunction}
              />
            </ResizablePanel>
            <ResizableHandle className="z-30" />
            <ResizablePanel className="flex-grow" minSize={40} defaultSize={40}>
              <DataTable
                enableRowSelection
                columns={columns}
                data={data?.items}
                onRowClick={(row) => push(`/project/${params?.projectId}/evaluations/${row.original.id}`)}
                defaultPageNumber={page.number}
                defaultPageSize={page.size}
                pageCount={Math.ceil(Number(data?.totalCount || 0) / page.size)}
                totalItemsCount={Number(data?.totalCount || 0)}
                onPageChange={handlePageChange}
                getRowId={(row: Evaluation) => row.id}
                paginated
                manualPagination
                pageSizeOptions={[10, 25]}
                childrenClassName="flex flex-col gap-2 py-2 items-start h-fit space-x-0"
                selectionPanel={(selectedRowIds) => (
                  <div className="flex flex-col space-y-2">
                    <DeleteSelectedRows
                      selectedRowIds={selectedRowIds}
                      onDelete={handleDeleteEvaluations}
                      entityName="evaluations"
                    />
                  </div>
                )}
              >
                <div className="flex flex-1 w-full space-x-2">
                  <DataTableFilter columns={filters} />
                  <SearchEvaluationsInput />
                </div>
                <DataTableFilterList />
              </DataTable>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  );
}
