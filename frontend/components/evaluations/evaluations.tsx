"use client";

import { ColumnDef } from "@tanstack/react-table";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";

import ProgressionChart from "@/components/evaluations/progression-chart";
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
    header: "Created at",
    accessorKey: "createdAt",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
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

  const page = useMemo<{ number: number; size: number }>(() => {
    const size = searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : 25;
    return {
      number: searchParams.get("pageNumber") ? Number(searchParams.get("pageNumber")) : 0,
      size,
    };
  }, [searchParams]);

  const { data, mutate, isLoading } = useSWR<PaginatedResponse<Evaluation & { dataPointsCount: 0 }>>(
    `/api/projects/${params?.projectId}/evaluations?groupId=${searchParams.get("groupId")}&pageNumber=${page.number}&pageSize=${page.size}`,
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
      const response = await fetch(
        `/api/projects/${params?.projectId}/evaluations?evaluationIds=${selectedRowIds.join(",")}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

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
                selectionPanel={(selectedRowIds) => (
                  <div className="flex flex-col space-y-2">
                    <DeleteSelectedRows
                      selectedRowIds={selectedRowIds}
                      onDelete={handleDeleteEvaluations}
                      entityName="evaluations"
                    />
                  </div>
                )}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  );
}
