"use client";

import { ColumnDef } from "@tanstack/react-table";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useMemo, useState } from "react";
import useSWR from "swr";

import DeleteSelectedRows from "@/components/ui/DeleteSelectedRows";
import { useProjectContext } from "@/contexts/project-context";
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
import ProgressionChart from "./progression-chart";

const columns: ColumnDef<Evaluation>[] = [
  {
    accessorKey: "groupId",
    header: "Group id",
    size: 120,
  },
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
  const { projectId } = useProjectContext();
  const pathName = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const posthog = usePostHog();
  const { email } = useUserContext();

  const { data, mutate } = useSWR<PaginatedResponse<Evaluation>>(
    `/api/projects/${projectId}/evaluations?groupId=${searchParams.get("groupId")}`,
    swrFetcher
  );
  const evaluations = data?.items;

  const [aggregationFunction, setAggregationFunction] = useState<AggregationFunction>("AVG");

  const handleDeleteEvaluations = async (selectedRowIds: string[]) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/evaluations?evaluationIds=${selectedRowIds.join(",")}`, {
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

  const page = useMemo<{ number: number; size: number; count: number }>(() => {
    const size = searchParams.get("pageSize") ? parseInt(String(searchParams.get("pageSize"))) : 25;
    return {
      number: searchParams.get("pageNumber") ? parseInt(String(searchParams.get("pageNumber"))) : 0,
      size,
      count: Math.ceil(Number(data?.totalCount || 0) / size),
    };
  }, [data?.totalCount, searchParams]);

  return (
    <div className="flex flex-col h-full">
      <Header path="evaluations" />
      <div className="flex h-full w-full">
        <EvaluationsGroupsBar />
        <div className="flex flex-col h-full flex-grow space-y-4">
          <div className="flex justify-start items-center flex-none p-2 space-x-4 w-full">
            <div>
              <Select
                value={aggregationFunction}
                onValueChange={(value) => setAggregationFunction(value as AggregationFunction)}
              >
                <SelectTrigger>
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
          </div>
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel className="flex-none px-2" minSize={15} defaultSize={20}>
              <ProgressionChart className="h-full flex-none px-2" aggregationFunction={aggregationFunction} />
            </ResizablePanel>
            <ResizableHandle className="z-50" />
            <ResizablePanel className="flex-grow" minSize={30}>
              <DataTable
                enableRowSelection={true}
                columns={columns}
                data={evaluations}
                onRowClick={(row) => router.push(`/project/${projectId}/evaluations/${row.original.id}`)}
                defaultPageNumber={page.number}
                defaultPageSize={page.size}
                pageCount={page.count}
                totalItemsCount={data?.totalCount}
                onPageChange={(pageNumber, pageSize) => {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set("pageNumber", pageNumber.toString());
                  params.set("pageSize", pageSize.toString());
                  router.push(`${pathName}?${params}`);
                }}
                getRowId={(row: Evaluation) => row.id}
                paginated
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
