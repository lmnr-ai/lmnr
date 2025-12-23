"use client";

import { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { useParams, useRouter } from "next/navigation";
import {useCallback, useEffect, useState} from "react";
import useSWR from "swr";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import Header from "@/components/ui/header";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import Mono from "@/components/ui/mono";
import { RolloutSession } from "@/lib/actions/rollout-sessions";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

const columns: ColumnDef<RolloutSession>[] = [
  {
    cell: ({ row }) => <Mono className="text-xs">{row.original.id}</Mono>,
    size: 300,
    header: "ID",
    id: "id",
  },
  {
    cell: ({ row }) => <Mono className="text-xs">{row.original.traceId}</Mono>,
    size: 300,
    header: "Trace ID",
    id: "traceId",
  },
  {
    header: "Created",
    accessorKey: "createdAt",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    id: "createdAt",
    size: 180,
  },
  {
    header: "Cursor Timestamp",
    accessorKey: "cursorTimestamp",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    id: "cursorTimestamp",
    size: 180,
  },
  {
    header: "Paths Count",
    accessorFn: (row) => Object.keys(row.pathToCount || {}).length,
    id: "pathsCount",
    size: 120,
  },
];

const defaultRolloutSessionsColumnOrder = ["id", "traceId", "createdAt", "cursorTimestamp", "pathsCount"];

function RolloutSessionsContent() {
  const { projectId } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const { data, isLoading, error } = useSWR<RolloutSession[]>(
    `/api/projects/${projectId}/rollout-sessions`,
    swrFetcher
  );


  useEffect(() => {
    if (error && error instanceof Error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  }, [error, toast]);

  return (
    <>
      <Header path="rollout-sessions" />
      <div className="flex px-4 pb-4 flex-col gap-4 overflow-hidden flex-1">
        <div className="flex overflow-hidden flex-1">
          <InfiniteDataTable
            getRowId={(row: RolloutSession) => row.id}
            columns={columns}
            data={data ?? []}
            hasMore={false}
            getRowHref={(row) => `rollout-sessions/${row.id}`}
            isFetching={false}
            isLoading={isLoading}
            fetchNextPage={() => {}}
            state={{
              rowSelection,
            }}
            onRowSelectionChange={setRowSelection}
          >
            <div className="flex flex-1 w-full space-x-2 pt-1">
              <ColumnsMenu
                columnLabels={columns.map((column) => ({
                  id: column.id!,
                  label: typeof column.header === "string" ? column.header : column.id!,
                }))}
              />
            </div>
          </InfiniteDataTable>
        </div>
      </div>
    </>
  );
}

export default function RolloutSessions() {
  return (
    <DataTableStateProvider storageKey="rollout-sessions-table" defaultColumnOrder={defaultRolloutSessionsColumnOrder}>
      <RolloutSessionsContent />
    </DataTableStateProvider>
  );
}
