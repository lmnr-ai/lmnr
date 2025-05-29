"use client";

import { ColumnDef } from "@tanstack/react-table";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import useSWR from "swr";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { DataTable } from "@/components/ui/datatable";
import DeleteSelectedRows from "@/components/ui/DeleteSelectedRows";
import { TableCell, TableRow } from "@/components/ui/table";
import { Evaluator } from "@/lib/evaluators/types";
import { useToast } from "@/lib/hooks/use-toast";
import { PaginatedResponse } from "@/lib/types";
import { swrFetcher } from "@/lib/utils";

interface EvaluatorsTableProps {
  projectId: string;
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

export default function EvaluatorsTable({ projectId }: EvaluatorsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const page = useMemo(() => {
    const size = searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : 25;
    return {
      number: searchParams.get("pageNumber") ? Number(searchParams.get("pageNumber")) : 0,
      size,
    };
  }, [searchParams]);

  const { data, mutate } = useSWR<PaginatedResponse<Evaluator>>(
    `/api/projects/${projectId}/evaluators?pageNumber=${page.number}&pageSize=${page.size}`,
    swrFetcher
  );

  const handlePageChange = useCallback(
    (pageNumber: number, pageSize: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("pageNumber", pageNumber.toString());
      params.set("pageSize", pageSize.toString());
      router.push(`${pathname}?${params}`);
    },
    [pathname, router, searchParams]
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
    <div className="flex-grow">
      <DataTable
        columns={columns}
        data={data?.items}
        getRowId={(row) => row.id}
        paginated
        manualPagination
        pageCount={Math.ceil((data?.totalCount || 0) / page.size)}
        defaultPageSize={page.size}
        defaultPageNumber={page.number}
        onPageChange={handlePageChange}
        totalItemsCount={data?.totalCount}
        enableRowSelection
        selectionPanel={(selectedRowIds) => (
          <div className="flex flex-col space-y-2">
            <DeleteSelectedRows
              selectedRowIds={selectedRowIds}
              onDelete={handleDeleteEvaluators}
              entityName="evaluators"
            />
          </div>
        )}
        emptyRow={
          <TableRow>
            <TableCell colSpan={columns.length} className="text-center text">
              No evaluators found. Create your first evaluator to get started.
            </TableCell>
          </TableRow>
        }
      />
    </div>
  );
}
