"use client";

import { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { Loader2, Trash2 } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { Button } from "@/components/ui/button";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { DataTableSearch } from "@/components/ui/infinite-datatable/ui/datatable-search";
import Mono from "@/components/ui/mono";
import { useToast } from "@/lib/hooks/use-toast";
import { LabelingQueue } from "@/lib/queue/types";
import { PaginatedResponse } from "@/lib/types";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import Header from "../ui/header";
import CreateQueueDialog from "./create-queue-dialog";

const columns: ColumnDef<LabelingQueue>[] = [
  {
    cell: ({ row }) => <Mono>{row.original.id}</Mono>,
    size: 300,
    header: "ID",
    id: "id",
  },
  {
    accessorKey: "name",
    header: "Name",
    size: 300,
  },
  {
    accessorKey: "count",
    header: "Count",
    size: 300,
  },
  {
    header: "Created at",
    accessorKey: "createdAt",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
  },
];

export const defaultQueuesColumnOrder = ["__row_selection", "id", "name", "count", "createdAt"];

const queuesTableFilters: ColumnFilter[] = [
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
];

const FETCH_SIZE = 50;

const QueuesContent = () => {
  const { projectId } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const filter = searchParams.getAll("filter");
  const search = searchParams.get("search");

  const fetchQueues = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());

        filter.forEach((f) => urlParams.append("filter", f));

        if (typeof search === "string" && search.length > 0) {
          urlParams.set("search", search);
        }

        const url = `/api/projects/${projectId}/queues?${urlParams.toString()}`;
        const res = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          const text = await res.json();
          throw new Error(text.error || "Failed to fetch queues");
        }

        const data = await res.json();
        return { items: data.items, count: data.totalCount };
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load queues. Please try again.",
          variant: "destructive",
        });
        throw error;
      }
    },
    [projectId, toast, filter, search]
  );

  const {
    data: queues,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
    updateData,
  } = useInfiniteScroll<LabelingQueue & { count: number }>({
    fetchFn: fetchQueues,
    enabled: true,
    deps: [projectId, filter, search],
  });

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteQueues = async (queueIds: string[]) => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/queues?queueIds=${queueIds.join(",")}`, {
        method: "DELETE",
      });

      if (res.ok) {
        updateData((currentData) => currentData.filter((queue) => !queueIds.includes(queue.id)));
        setRowSelection({});
        toast({
          title: "Queues deleted",
          description: `Successfully deleted ${queueIds.length} queue(s).`,
        });
      } else {
        throw new Error("Failed to delete queues");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete queues. Please try again.",
        variant: "destructive",
      });
    }
    setIsDeleting(false);
    setIsDeleteDialogOpen(false);
  };

  return (
    <>
      <Header path="labeling queues" />
      <div className="flex flex-col gap-4 px-4 pb-4">
        <CreateQueueDialog onSuccess={(queue) => router.push(`/project/${projectId}/labeling-queues/${queue.id}`)}>
          <Button icon="plus" className="w-fit">
            Queue
          </Button>
        </CreateQueueDialog>
        <InfiniteDataTable
          enableRowSelection={true}
          onRowClick={(row) => {
            router.push(`/project/${projectId}/labeling-queues/${row.original.id}`);
          }}
          getRowId={(row: LabelingQueue) => row.id}
          columns={columns}
          data={queues ?? []}
          hasMore={hasMore}
          isFetching={isFetching}
          isLoading={isLoading}
          fetchNextPage={fetchNextPage}
          state={{
            rowSelection,
          }}
          onRowSelectionChange={setRowSelection}
          lockedColumns={["__row_selection"]}
          selectionPanel={(selectedRowIds) => (
            <div className="flex flex-col space-y-2">
              <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost">
                    <Trash2 size={12} />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete Labeling Queues</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to delete {selectedRowIds.length} labeling queue(s)? This action cannot be
                      undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>
                      Cancel
                    </Button>
                    <Button onClick={() => handleDeleteQueues(selectedRowIds)} disabled={isDeleting}>
                      {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Delete
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
        >
          <div className="flex flex-1 w-full space-x-2">
            <DataTableFilter columns={queuesTableFilters} />
            <ColumnsMenu lockedColumns={["__row_selection"]} />
            <DataTableSearch searchColumns={["name"]} placeholder="Search by queue name..." />
            <DataTableFilterList />
          </div>
        </InfiniteDataTable>
      </div>
    </>
  );
};

export default function Queues() {
  return (
    <DataTableStateProvider storageKey="queues-table" defaultColumnOrder={defaultQueuesColumnOrder}>
      <QueuesContent />
    </DataTableStateProvider>
  );
}
