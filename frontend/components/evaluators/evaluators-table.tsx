"use client";

import { ColumnDef, Row, RowSelectionState } from "@tanstack/react-table";
import { useCallback, useState } from "react";
import useSWR from "swr";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import DeleteSelectedRows from "@/components/ui/DeleteSelectedRows";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { Evaluator } from "@/lib/evaluators/types";
import { useToast } from "@/lib/hooks/use-toast";
import { PaginatedResponse } from "@/lib/types";
import { swrFetcher } from "@/lib/utils";

interface EvaluatorsTableProps {
  projectId: string;
  onRowClick: (row: Row<Evaluator>) => void;
}

const columns: ColumnDef<Evaluator>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <div className="font-medium">{row.getValue("name")}</div>,
  },
  {
    accessorKey: "evaluatorType",
    header: "Type",
    cell: ({ row }) => <div className="text-sm text-muted-foreground">{row.getValue("evaluatorType")}</div>,
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => <ClientTimestampFormatter timestamp={row.getValue("createdAt")} />,
  },
];

export default function EvaluatorsTable({ projectId, onRowClick }: EvaluatorsTableProps) {
  const { toast } = useToast();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const { data, mutate } = useSWR<PaginatedResponse<Evaluator>>(
    `/api/projects/${projectId}/evaluators?pageNumber=0&pageSize=10000`,
    swrFetcher
  );

  const handleDeleteEvaluators = useCallback(
    async (selectedRowIds: string[]) => {
      try {
        const params = new URLSearchParams(selectedRowIds.map((id) => ["id", id]));

        const response = await fetch(`/api/projects/${projectId}/evaluators?${params.toString()}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          await mutate();
          setRowSelection({});
          toast({
            title: "Evaluators deleted",
            description: `Successfully deleted ${selectedRowIds.length} evaluator(s).`,
          });
        } else {
          throw new Error("Failed to delete evaluators");
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete evaluators. Please try again.",
          variant: "destructive",
        });
      }
    },
    [mutate, projectId, toast]
  );

  return (
    <InfiniteDataTable
      columns={columns}
      data={data?.items ?? []}
      hasMore={false}
      isFetching={false}
      isLoading={!data}
      fetchNextPage={() => {}}
      getRowId={(row) => row.id}
      onRowClick={onRowClick}
      enableRowSelection
      state={{
        rowSelection,
      }}
      onRowSelectionChange={setRowSelection}
      selectionPanel={(selectedRowIds) => (
        <div className="flex flex-col space-y-2">
          <DeleteSelectedRows
            selectedRowIds={selectedRowIds}
            onDelete={handleDeleteEvaluators}
            entityName="evaluators"
          />
        </div>
      )}
    />
  );
}
