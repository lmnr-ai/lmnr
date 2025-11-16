"use client";

import { ColumnDef, Row } from "@tanstack/react-table";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import React, { useCallback, useState } from "react";

import SearchInput from "@/components/common/search-input";
import ProgressionChart from "@/components/evaluations/progression-chart";
import DeleteSelectedRows from "@/components/ui/delete-selected-rows.tsx";
import JsonTooltip from "@/components/ui/json-tooltip.tsx";
import { useUserContext } from "@/contexts/user-context";
import { AggregationFunction, aggregationLabelMap } from "@/lib/clickhouse/types";
import { Evaluation } from "@/lib/evaluation/types";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { useToast } from "@/lib/hooks/use-toast";
import { InfiniteDataTable } from "@/widgets/ui/infinite-datatable";
import { useInfiniteScroll, useSelection } from "@/widgets/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/widgets/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/widgets/ui/infinite-datatable/ui/columns-menu.tsx";
import DataTableFilter, { DataTableFilterList } from "@/widgets/ui/infinite-datatable/ui/datatable-filter";
import { ColumnFilter } from "@/widgets/ui/infinite-datatable/ui/datatable-filter/utils";

import ClientTimestampFormatter from "../client-timestamp-formatter";
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
    accessorFn: (row) => row.metadata,
    cell: (row) => <JsonTooltip data={row.getValue()} columnSize={row.column.getSize()} />,
  },
  {
    header: "Created at",
    accessorKey: "createdAt",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
  },
];

export const defaultEvaluationsColumnOrder = [
  "__row_selection",
  "id",
  "name",
  "dataPointsCount",
  "metadata",
  "createdAt",
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

const FETCH_SIZE = 50;

export default function Evaluations() {
  return (
    <DataTableStateProvider storageKey="evaluations-table" defaultColumnOrder={defaultEvaluationsColumnOrder}>
      <EvaluationsContent />
    </DataTableStateProvider>
  );
}

function EvaluationsContent() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const posthog = usePostHog();
  const { email } = useUserContext();
  const groupId = searchParams.get("groupId");
  const filter = searchParams.getAll("filter");
  const search = searchParams.get("search");

  const [aggregationFunction, setAggregationFunction] = useState<AggregationFunction>(AggregationFunction.AVG);

  const fetchEvaluations = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());

        if (groupId) {
          urlParams.set("groupId", groupId);
        }

        if (search && search.trim() !== "") {
          urlParams.set("search", search);
        }

        filter.forEach((f) => urlParams.append("filter", f));

        const url = `/api/projects/${params?.projectId}/evaluations?${urlParams.toString()}`;

        const res = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          const text = (await res.json()) as { error: string };
          throw new Error(text.error);
        }

        const data = (await res.json()) as { items: Evaluation[]; totalCount: number };
        return { items: data.items, count: data.totalCount };
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load evaluations. Please try again.",
          variant: "destructive",
        });
        throw error;
      }
    },
    [filter, groupId, params?.projectId, search, toast]
  );

  const {
    data: evaluations,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
    refetch,
  } = useInfiniteScroll<Evaluation>({
    fetchFn: fetchEvaluations,
    enabled: true,
    deps: [filter, groupId, params?.projectId, search],
  });

  const { rowSelection, onRowSelectionChange } = useSelection();

  const handleDeleteEvaluations = async (evaluationIds: string[]) => {
    try {
      const response = await fetch(`/api/projects/${params?.projectId}/evaluations`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          evaluationIds,
        }),
      });

      if (response.ok) {
        await refetch();

        toast({
          title: "Evaluations deleted",
          description: `Successfully deleted ${evaluationIds.length} evaluation(s).`,
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

  const handleRowClick = useCallback(
    (row: Row<Evaluation>) => {
      router.push(`/project/${params?.projectId}/evaluations/${row.original.id}`);
    },
    [params?.projectId, router]
  );

  if (isFeatureEnabled(Feature.POSTHOG)) {
    posthog.identify(email);
  }

  return (
    <>
      <Header path="evaluations" />
      <div className="flex flex-1 overflow-hidden pb-4 px-4 gap-4">
        <EvaluationsGroupsBar />
        <div className="flex flex-col w-full gap-2 overflow-hidden">
          <div className="flex gap-4 items-center">
            <div className="font-medium text-lg">{searchParams.get("groupId")}</div>
            <Select
              value={aggregationFunction}
              onValueChange={(value) => setAggregationFunction(value as AggregationFunction)}
            >
              <SelectTrigger className="w-fit">
                <SelectValue placeholder="Aggregate" />
              </SelectTrigger>
              <SelectContent>
                {(Object.values(AggregationFunction) as AggregationFunction[]).map((option) => (
                  <SelectItem key={option} value={option}>
                    {aggregationLabelMap[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ResizablePanelGroup className="overflow-hidden" direction="vertical">
            <ResizablePanel className="px-2 border rounded bg-secondary" minSize={20} defaultSize={20}>
              <ProgressionChart
                evaluations={evaluations.map(({ id, name }) => ({ id, name }))}
                className="h-full px-2 py-4"
                aggregationFunction={aggregationFunction}
              />
            </ResizablePanel>
            <ResizableHandle withHandle className="z-30 mb-2 bg-transparent transition-colors duration-200" />
            <ResizablePanel className="flex flex-1 w-full overflow-hidden" minSize={40} defaultSize={40}>
              <InfiniteDataTable<Evaluation>
                className="w-full"
                enableRowSelection
                columns={columns}
                data={evaluations}
                getRowId={(evaluation) => evaluation.id}
                onRowClick={handleRowClick}
                hasMore={hasMore}
                isFetching={isFetching}
                isLoading={isLoading}
                fetchNextPage={fetchNextPage}
                estimatedRowHeight={41}
                state={{ rowSelection }}
                onRowSelectionChange={onRowSelectionChange}
                childrenClassName="flex flex-col gap-2 items-start h-fit space-x-0"
                lockedColumns={["__row_selection"]}
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
                  <SearchInput placeholder="Search evaluations by name..." />
                </div>
                <DataTableFilterList />
                <ColumnsMenu lockedColumns={["__row_selection"]} />
              </InfiniteDataTable>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </>
  );
}
